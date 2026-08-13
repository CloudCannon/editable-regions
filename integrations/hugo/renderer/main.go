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
//	initHugoEditorSite()      – learn dirs from the mirrored site config,
//	                            prepare cc-editor.json, create the site
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

// configureEditorSite splices the renderer-owned editor settings into the
// browser-written cc-editor.json before allconfig reads it:
//
//   - the site's real contentDir/dataDir, learned natively from the mirrored
//     site config (learnSiteConfigDirs) and forwarded verbatim — the browser
//     mirrors collections/datasets at their site-root-relative paths, so they
//     land under these dirs exactly where Hugo reads them, and the render
//     target/home guard already resolve through the compiled config;
//   - the home page's publishing opt-in: the browser's config suppresses all
//     page output (build.render: link under a cascade), but the editor must
//     still publish the home page — it's the render fallback and the boot
//     surface — so a cascade entry targeting the home kind is prepended.
//
// Being config-level (not a content-file front-matter write) it survives every
// stub rewrite, never adds a file write to a render build, and needs no
// directory or page-path knowledge on the browser side.
func (builder *editorSiteBuilder) configureEditorSite(contentDir, dataDir string) error {
	contents, err := builder.readFile("cc-editor.json")
	if err != nil {
		return fmt.Errorf("cc-editor.json not readable: %w", err)
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(contents), &cfg); err != nil {
		return fmt.Errorf("cc-editor.json is not valid JSON: %w", err)
	}
	if contentDir != "" {
		cfg["contentDir"] = contentDir
	}
	if dataDir != "" {
		cfg["dataDir"] = dataDir
	}
	homeCascade := map[string]interface{}{
		"_target": map[string]interface{}{"kind": "home"},
		"build":   map[string]interface{}{"render": "always"},
	}
	// Preserve the browser's suppression cascade by placing the home rule in
	// front of it (cascade entries are first-match-wins per page).
	switch existing := cfg["cascade"].(type) {
	case []interface{}:
		cfg["cascade"] = append([]interface{}{homeCascade}, existing...)
	case map[string]interface{}:
		cfg["cascade"] = []interface{}{homeCascade, existing}
	default:
		cfg["cascade"] = []interface{}{
			homeCascade,
			map[string]interface{}{"build": map[string]interface{}{"render": "link"}},
		}
	}
	encoded, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to encode cc-editor.json: %w", err)
	}
	builder.writeFile("cc-editor.json", string(encoded))
	return nil
}

// learnSiteConfigDirs resolves the site's real contentDir/dataDir by loading
// the mirrored site config (mirrorSiteConfig in the browser) with Hugo's own
// config resolution — default-name root search, config/_default + the
// cc-env-carried environment merged on top — so none of Hugo's precedence
// rules are re-implemented here. The mirrored candidates are always JSON at
// their real paths and carry no theme/module (the browser drops them), so
// this load can't fail on resolution the editor never performs. Returns empty
// strings when no site config was mirrored: the editor keeps its defaults.
func (builder *editorSiteBuilder) learnSiteConfigDirs() (string, string) {
	env := "production"
	if contents, err := builder.readFile("cc-env"); err == nil {
		env = strings.TrimSpace(contents)
	}
	cfg, err := allconfig.LoadConfig(allconfig.ConfigSourceDescriptor{
		Fs:          builder.Afs,
		Flags:       config.New(),
		ConfigDir:   "config",
		Environment: env,
	})
	if err != nil {
		return "", ""
	}
	// cfg.Base is the allconfig.Config — the same resolved source the editor
	// build reads later (ContentDir/DataDir come from RootConfig.CommonDirs).
	if cfg.Base == nil {
		return "", ""
	}
	return cfg.Base.ContentDir, cfg.Base.DataDir
}

func (builder *editorSiteBuilder) loadConfig() error {
	cfg, err := allconfig.LoadConfig(allconfig.ConfigSourceDescriptor{
		Fs:       builder.Afs,
		Flags:    config.New(),
		Filename: "cc-editor.json",
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
	<-c
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
// The site config (written by the browser from the snapshot) carries no
// directory keys; configureEditorSite splices in the site's real
// contentDir/dataDir (learned natively from the mirrored site config, see
// learnSiteConfigDirs) so the dispatch layout + stubs land where Hugo reads
// them. LayoutDir is never forwarded: the editor's templates live at the
// canonical layouts/ root the snapshot keys them under. The home opt-in lives
// in the editor config (see configureEditorSite), not in browsed/mirrored
// front matter, so it survives any content rewrite and never adds a file
// write to a render build.
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	// Learn the site's real contentDir/dataDir first: the browser mirrors the
	// site config at its real paths (JSON, theme/module stripped), and the
	// probe below resolves it with Hugo's own config loading so the dirs come
	// out exactly as the site's build resolves them. Layout dir is never
	// forwarded — the editor's templates live at the canonical layouts/ root
	// the snapshot keys them under.
	siteContentDir, siteDataDir := builder.learnSiteConfigDirs()

	// Load config first so the dispatch layout and stub can be written under
	// the resolved layoutDir/contentDir. After that the original
	// write-then-create-then-build order is preserved: Hugo's first Running
	// build only re-renders everything when the files exist before the site
	// is created.
	if err := builder.configureEditorSite(siteContentDir, siteDataDir); err != nil {
		return errorValue("failed to configure editor site: %s", err)
	}
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
	// the editor config (configureEditorSite). Only plant a placeholder home
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
