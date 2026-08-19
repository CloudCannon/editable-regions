// A minimal Hugo renderer compiled to WASM for CloudCannon editable regions.
//
// Holds a hugolib.HugoSites over an in-memory filesystem and re-renders a
// single page per request. The browser writes the site's config, partials,
// and data files once at startup; each component render then rewrites one
// content file and runs an incremental build — the cheapest rebuild path
// Hugo offers.
//
// Exposed on the JS global scope:
//
//	writeHugoFiles(json)      – {"path": "contents", ...}
//	removeHugoFiles(json)     – ["path", ...]
//	readHugoFiles(json)       – ["path", ...] -> {"path": "contents"}
//	initHugoEditorSite()      – load the site config (with editor overrides)
//	                            and create the site
//	rebuildHugoEditorSite()   – run an incremental build of the editor site
//	renderHugoPartial(json)   – {"partial": "card.html", "props": {...},
//	                            "target": "content/blog/one.md"}
//	                            -> {"html": "..."} or {"error": "..."}
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
	"syscall/js"

	"github.com/fsnotify/fsnotify"
	"github.com/goccy/go-yaml"
	"github.com/gohugoio/hugo/config"
	"github.com/gohugoio/hugo/config/allconfig"
	"github.com/gohugoio/hugo/deps"
	"github.com/gohugoio/hugo/hugofs"
	"github.com/gohugoio/hugo/hugolib"
	"github.com/spf13/afero"
)

// The layout every rendered page goes through. The render request rides in
// the front matter of a dedicated headless page (contentDir/cc-dispatch),
// so the layout can run the requested partial while keeping the page being
// rendered as the template's Page — components reach their page through the
// `page` global without the request keys polluting any real page's front
// matter. Headless pages are invisible to site.Pages/AllPages/RegularPages
// but resolvable via site.GetPage, and they render no output of their own.
// No template filesystem access is needed, so this works in the WASM
// renderer where os.ReadFile sees no files.
// Existence of the requested partial is checked in-template with
// templates.Exists — the same authoritative namespace query the build-time
// walk uses — so a missing component renders a distinct marker element
// instead of dying inside Hugo's raw "partial not found" trace. The runtime
// detects the marker and turns it into a clean error message. (errorf can't
// carry the message reliably: Hugo logs it and the build only reports
// "logged N errors".) Candidates mirror the naming a component author may
// use (extension optional), matching what the partial call below resolves.
const editorLayout = `{{- $dispatch := site.GetPage "/cc-dispatch/" -}}
{{- if $dispatch -}}
  {{- if $dispatch.Params.cc_partial -}}
    {{- $partial := $dispatch.Params.cc_partial -}}
    {{- $found := templates.Exists (printf "partials/%s" $partial) -}}
    {{- $found = or $found (templates.Exists (printf "partials/%s.html" $partial)) -}}
    {{- $found = or $found (templates.Exists (printf "partials/%s.htm" $partial)) -}}
    {{- if not $found -}}
      <cc-missing-partial data-name="{{ $partial }}"></cc-missing-partial>
    {{- else -}}
      {{- partial $partial $dispatch.Params.cc_props -}}
    {{- end -}}
  {{- end -}}
{{- end -}}`

type editorSiteBuilder struct {
	Cfg          *allconfig.Configs
	Afs          afero.Fs
	Fs           *hugofs.Fs
	Sites        *hugolib.HugoSites
	changedFiles []string
	removedFiles []string
}

// editorFlags builds the renderer-owned config overrides the editor site
// applies on top of the site's own config (which loadConfig reads through
// Hugo's default-name search). Flags override any config-file setting:
//
//   - disableKinds: taxonomy/term/RSS/sitemap/robotsTXT/404 never render in
//     the editor, trimming every rebuild to content pages only;
//   - cascade: suppress per-page output (build.render: link) so pages stay in
//     the store (site.Pages, .GetPage, .RelPermalink, .Content all keep
//     working) while only opted-in pages emit HTML — the home page (the render
//     fallback and boot surface) opts back in via the first, home-targeting
//     entry, and the current edit target opts in via front matter;
func editorFlags() config.Provider {
	flags := config.New()
	flags.Set("disableKinds", []string{"taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"})
	flags.Set("cascade", []interface{}{
		map[string]interface{}{
			"_target": map[string]interface{}{"kind": "home"},
			"build":   map[string]interface{}{"render": "always"},
		},
		map[string]interface{}{
			"build": map[string]interface{}{"render": "link"},
		},
	})
	return flags
}

func (builder *editorSiteBuilder) loadConfig() error {
	env := "production"
	if contents, err := builder.readFile("cc-env"); err == nil {
		env = strings.TrimSpace(contents)
	}
	cfg, err := allconfig.LoadConfig(allconfig.ConfigSourceDescriptor{
		Fs:          builder.Afs,
		Flags:       editorFlags(),
		ConfigDir:   "config",
		Environment: env,
		// The editor can only resolve what's mirrored (the theme and vendored
		// modules); any other import — most notably the editable-regions module
		// itself, whose replacement points at the repo on disk — can't resolve
		// in the in-memory filesystem, so skip it rather than fail the load.
		IgnoreModuleDoesNotExist: true,
	})
	if err != nil {
		return err
	}

	// The editor runs "rebuilds" rather than fresh builds; Running/Watch
	// enable Hugo's incremental change-event pipeline. hugoInfo (the `hugo.*`
	// template namespace, e.g. `hugo.IsServer`) reads these from the
	// per-language configs, so propagate the flags beyond the root config.
	cfg.Base.WorkingDir = ""
	cfg.Base.Internal.Running = true
	cfg.Base.Internal.Watch = true
	for _, languageConfig := range cfg.LanguageConfigMap {
		languageConfig.Internal.Running = true
		languageConfig.Internal.Watch = true
	}
	builder.Cfg = cfg
	builder.Fs = hugofs.NewFrom(builder.Afs, cfg.GetFirstLanguageConfig().BaseConfig())

	return nil
}

func (builder *editorSiteBuilder) createSites() error {
	if err := builder.loadConfig(); err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	builder.Fs.PublishDir = hugofs.NewCreateCountingFs(builder.Fs.PublishDir)

	sites, err := hugolib.NewHugoSites(deps.DepsCfg{
		Fs:      builder.Fs,
		Configs: builder.Cfg,
	})
	if err != nil {
		return fmt.Errorf("failed to create sites: %w", err)
	}
	builder.Sites = sites

	return nil
}

func (builder *editorSiteBuilder) build() error {
	if builder.Sites == nil {
		if err := builder.createSites(); err != nil {
			return err
		}
	}

	err := builder.Sites.Build(hugolib.BuildCfg{NoBuildLock: true}, builder.changeEvents()...)

	// Each build consumes the pending change events. Replaying stale events
	// on later builds forces Hugo down the "template changed" rebuild path
	// every time, which re-renders the whole site.
	builder.changedFiles = nil
	builder.removedFiles = nil

	if err == nil {
		if n := builder.Sites.NumLogErrors(); n > 0 {
			err = fmt.Errorf("logged %d errors", n)
		}
	}
	return err
}

func (builder *editorSiteBuilder) writeFile(filename, content string) {
	if err := afero.WriteFile(builder.Afs, filepath.FromSlash(filename), []byte(content), 0755); err != nil {
		fmt.Println(fmt.Sprintf("Failed to write file: %s", err))
		return
	}

	builder.changedFiles = append(builder.changedFiles, filename)
}

func (builder *editorSiteBuilder) removeFile(filename string) {
	if err := builder.Afs.Remove(filename); err != nil {
		fmt.Println(fmt.Sprintf("Failed to remove file: %s", err))
		return
	}

	// Files in the publish dir aren't Hugo source files,
	// so their removal shouldn't be fed back in as a change event.
	if !strings.HasPrefix(filepath.ToSlash(filename), "public/") {
		builder.removedFiles = append(builder.removedFiles, filename)
	}
}

func (builder *editorSiteBuilder) readFile(filename string) (string, error) {
	b, err := afero.ReadFile(builder.Afs, filepath.Clean(filename))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (builder *editorSiteBuilder) changeEvents() []fsnotify.Event {
	var events []fsnotify.Event

	for _, v := range builder.changedFiles {
		events = append(events, fsnotify.Event{
			Name: v,
			Op:   fsnotify.Write,
		})
	}

	for _, v := range builder.removedFiles {
		events = append(events, fsnotify.Event{
			Name: v,
			Op:   fsnotify.Remove,
		})
	}

	return events
}

var builder editorSiteBuilder

func main() {
	builder = editorSiteBuilder{Afs: afero.NewMemMapFs()}

	log.SetOutput(io.Discard)

	c := make(chan struct{}, 0)
	js.Global().Set("writeHugoFiles", js.FuncOf(writeHugoFiles))
	js.Global().Set("removeHugoFiles", js.FuncOf(removeHugoFiles))
	js.Global().Set("readHugoFiles", js.FuncOf(readHugoFiles))
	js.Global().Set("initHugoEditorSite", js.FuncOf(initHugoEditorSite))
	js.Global().Set("rebuildHugoEditorSite", js.FuncOf(rebuildHugoEditorSite))
	js.Global().Set("renderHugoPartial", js.FuncOf(renderHugoPartial))
	js.Global().Set("dumpResolvedConfig", js.FuncOf(dumpResolvedConfig))
	<-c
}

// dumpResolvedConfig returns the editor's resolved config (dirs, theme, and
// resolved modules with their physical dirs) as a JS object, so a booted test
// can inspect what the renderer actually loaded. Debug helper; inert until
// called via globalThis.dumpResolvedConfig().
func dumpResolvedConfig(this js.Value, args []js.Value) (result interface{}) {
	defer func() {
		if r := recover(); r != nil {
			result = js.ValueOf(map[string]interface{}{"panic": fmt.Sprintf("%v", r)})
		}
	}()
	if builder.Cfg == nil || builder.Cfg.Base == nil {
		return js.ValueOf(map[string]interface{}{"error": "config not loaded"})
	}
	c := builder.Cfg.Base
	out := map[string]interface{}{
		"baseURL":     c.BaseURL,
		"title":       c.Title,
		"theme":       strings.Join(c.Theme, ","),
		"contentDir":  c.ContentDir,
		"dataDir":     c.DataDir,
		"layoutDir":   c.LayoutDir,
		"staticDir":   strings.Join(c.StaticDir, ","),
		"themesDir":   c.ThemesDir,
		"publishDir":  c.PublishDir,
		"resourceDir": c.ResourceDir,
	}
	var mods []interface{}
	for _, m := range builder.Cfg.Modules {
		mods = append(mods, map[string]interface{}{
			"path":   m.Path(),
			"dir":    m.Dir(),
			"vendor": m.Vendor(),
		})
	}
	out["modules"] = mods
	return js.ValueOf(out)
}

// JSON numbers decode to float64, but components expect the numeric types a
// real front matter build gives them — whole numbers as ints (printf "%d"
// works, large ids don't render in scientific notation), genuine fractions
// as floats. Recursively converts integral float64s to int64 before the
// props are written as YAML front matter. Values beyond the int64 range
// were already imprecise as doubles, so those stay floats.
func integralizeNumbers(v interface{}) interface{} {
	switch n := v.(type) {
	case float64:
		if n == math.Trunc(n) && n >= math.MinInt64 && n <= math.MaxInt64 {
			return int64(n)
		}
		return n
	case map[string]interface{}:
		for k, vv := range n {
			n[k] = integralizeNumbers(vv)
		}
		return n
	case []interface{}:
		for i, vv := range n {
			n[i] = integralizeNumbers(vv)
		}
		return n
	}
	return v
}

func errorValue(format string, args ...interface{}) js.Value {
	return js.ValueOf(map[string]interface{}{
		"error": fmt.Sprintf(format, args...),
	})
}

func writeHugoFiles(this js.Value, args []js.Value) interface{} {
	var writeFiles map[string]string
	if err := json.Unmarshal([]byte(args[0].String()), &writeFiles); err != nil {
		return errorValue("bad writeHugoFiles payload: %s", err)
	}

	for fileName, fileContents := range writeFiles {
		builder.writeFile(fileName, fileContents)
	}
	return nil
}

func removeHugoFiles(this js.Value, args []js.Value) interface{} {
	var removeFiles []string
	if err := json.Unmarshal([]byte(args[0].String()), &removeFiles); err != nil {
		return errorValue("bad removeHugoFiles payload: %s", err)
	}

	// The home stub is the render fallback and the boot surface — it stays
	// whatever the CloudCannon delete events say (its publishing comes from
	// the config cascade, but the home page itself must exist). Home identity
	// is a renderer concern: the browser never knows the content dir. Before
	// init no config is loaded, so only the post-init path is guarded.
	homeStub := ""
	if builder.Cfg != nil {
		homeStub = filepath.Join(builder.Cfg.Base.ContentDir, "_index.md")
	}
	for _, fileName := range removeFiles {
		if homeStub != "" && filepath.Clean(fileName) == filepath.Clean(homeStub) {
			continue
		}
		builder.removeFile(fileName)
	}
	return nil
}

func readHugoFiles(this js.Value, args []js.Value) interface{} {
	var readFiles []string
	if err := json.Unmarshal([]byte(args[0].String()), &readFiles); err != nil {
		return errorValue("bad readHugoFiles payload: %s", err)
	}

	fileContents := make(map[string]interface{})
	for _, fileName := range readFiles {
		contents, err := builder.readFile(fileName)
		if err != nil {
			continue
		}
		fileContents[fileName] = contents
	}

	return js.ValueOf(fileContents)
}

// Creates the Hugo site from the files written so far. The editor layout and
// a stub content file are installed here so the first build always has a
// renderable page.
//
// The site config is loaded through Hugo's own resolution (default-name root
// search + the config/ dir), so contentDir/dataDir/layoutDir/theme/module all
// come straight from the site's real config — the browser mirrors content
// stubs and templates at their site-root-relative paths, which land exactly
// where Hugo reads them. The renderer-owned overrides (disableKinds/cascade/
// markup) ride on top via editorFlags, and the home-page publishing opt-in is
// the cascade's home entry (not a front-matter write), so both survive any
// content rewrite without adding a file write to a render build.
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	// Load config first so the dispatch layout and stub can be written under
	// the resolved layoutDir/contentDir. After that the original
	// write-then-create-then-build order is preserved: Hugo's first Running
	// build only re-renders everything when the files exist before the site
	// is created.
	if err := builder.loadConfig(); err != nil {
		return errorValue("failed to load config: %s", err)
	}

	layoutDir := builder.Cfg.Base.LayoutDir
	contentDir := builder.Cfg.Base.ContentDir
	builder.writeFile(filepath.Join(layoutDir, "all.html"), editorLayout)

	// An empty dispatch page must exist before the first build: every
	// opted-in page's layout executes site.GetPage "/cc-dispatch/" and records
	// that page as a dependency, and the re-render chain depends on it. This
	// file is where each render request writes the partial + props.
	builder.writeFile(filepath.Join(contentDir, "cc-dispatch/index.md"), "---\nheadless: true\ncc_partial: \"\"\n---\n")

	// The browser mirrors every content stub (front matter only) before init;
	// the current edit target's stub carries build.render: always so it
	// publishes under the cascade, and the home page's publishing comes from
	// the cascade's home entry (editorFlags). Only plant a placeholder home
	// page when none arrived, so loader-provided data is never clobbered.
	homeStub := filepath.Join(contentDir, "_index.md")
	if _, err := builder.Afs.Stat(homeStub); os.IsNotExist(err) {
		builder.writeFile(homeStub, "---\ncc_initialized: true\n---\n")
	}

	if err := builder.createSites(); err != nil {
		return errorValue("failed to create site: %s", err)
	}
	if err := builder.build(); err != nil {
		return errorValue("initial build failed: %s", err)
	}
	return nil
}

// Runs an incremental build of the editor site without a render request. The
// browser calls this after writing content stubs from CloudCannon's site-wide
// change/delete events, so Hugo re-reads updated front matter into the store
// (collections, site.GetPage, and the current page's `page` data all refresh)
// before the next component render — and the dispatch write stays alone in
// its own render build, preserving the single-content-write-per-build
// invariant.
func rebuildHugoEditorSite(this js.Value, args []js.Value) interface{} {
	if builder.Sites == nil {
		return errorValue("editor site not initialized (call initHugoEditorSite first)")
	}
	if err := builder.build(); err != nil {
		return errorValue("%s", err)
	}
	return nil
}

type renderRequest struct {
	Partial string          `json:"partial"`
	Props   json.RawMessage `json:"props"`
	// The verbatim site-root-relative source file of the page being edited
	// ("content/blog/one.md") — the same string the browser mirrored it
	// as. After the build the renderer finds the built page whose
	// content-relative File().Path() matches (joined with the editor's
	// contentDir), so the render reads exactly the page Hugo built for the
	// edit target — no page-path approximation on either side. Empty or
	// unmatched falls back to the home page. The target is fixed at boot
	// (navigating reboots the editor) and never changes mid session.
	Target string `json:"target"`
}

// Where the built site writes the page at the given permalink: "/" is the
// home page (public/index.html); "/blog/one/" renders to
// public/blog/one/index.html.
func renderOutputPath(permalink string) string {
	rel := strings.Trim(permalink, "/")
	if rel == "" {
		return "public/index.html"
	}
	return "public/" + rel + "/index.html"
}

// Resolves the built output to read for a render: the page whose source file
// path matches target, or the home page when target is empty or matches no
// page (a non-content file, or a file outside the content tree). Matching by
// file path (not page identity) is exact — Hugo's own file->page mapping —
// and unambiguous even when real content front matter opts extra pages into
// publishing.
func (builder *editorSiteBuilder) targetOutputPath(target string) (string, error) {
	if target != "" && builder.Sites != nil {
		for _, s := range builder.Sites.Sites {
			for _, p := range s.Pages() {
				f := p.File()
				if f == nil {
					continue
				}
				if filepath.Join(builder.Cfg.Base.ContentDir, f.Path()) != target {
					continue
				}
				return renderOutputPath(p.RelPermalink()), nil
			}
		}
	}
	return renderOutputPath("/"), nil
}

func renderHugoPartial(this js.Value, args []js.Value) interface{} {
	var req renderRequest
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return errorValue("bad renderHugoPartial payload: %s", err)
	}
	if req.Partial == "" {
		return errorValue("renderHugoPartial requires a \"partial\" name")
	}

	var props interface{}
	if len(req.Props) > 0 {
		if err := json.Unmarshal(req.Props, &props); err != nil {
			return errorValue("bad props for %s: %s", req.Partial, err)
		}
	}

	contentDir := builder.Cfg.Base.ContentDir

	// The dispatch page carries the render request: partial and props. Every
	// opted-in page depends on it (their layouts site.GetPage it), so writing
	// it is what makes the edit target stale and re-rendered each render.
	// It's headless so it never appears in site.Pages/AllPages or emits
	// output of its own, and only the dispatch layout ever reads it — real
	// pages' front matter stays pristine. Its front matter is YAML (not JSON)
	// so props keep their types: JSON decodes every number as float64,
	// turning whole numbers into floats (printf "%d" fails, large ids print
	// in scientific notation). goccy/go-yaml is the same library Hugo's
	// front-matter decoder uses, and it quotes ambiguous strings (e.g.
	// date-looking values) so they stay strings. Keys keep their exact case
	// either way.
	frontMatter, err := yaml.Marshal(map[string]interface{}{
		"headless":   true,
		"cc_partial": req.Partial,
		"cc_props":   integralizeNumbers(props),
	})
	if err != nil {
		return errorValue("failed to encode request for %s: %s", req.Partial, err)
	}
	builder.writeFile(filepath.Join(contentDir, "cc-dispatch/index.md"), "---\n"+string(frontMatter)+"---\n")

	if err := builder.build(); err != nil {
		return errorValue("%s", err)
	}

	outputPath, err := builder.targetOutputPath(req.Target)
	if err != nil {
		return errorValue("%s", err)
	}
	html, err := builder.readFile(outputPath)
	if err != nil {
		return errorValue("build produced no output at %s for %s: %s", outputPath, req.Partial, err)
	}

	return js.ValueOf(map[string]interface{}{
		"html": html,
	})
}
