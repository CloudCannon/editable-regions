// A minimal Hugo renderer compiled to WASM for CloudCannon editable regions:
// it holds a hugolib.HugoSites over an in-memory filesystem and re-renders a
// single page per request. Exposed on the JS global scope: writeHugoFiles,
// removeHugoFiles, readHugoFiles, initHugoEditorSite, rebuildHugoEditorSite,
// renderHugoPartial.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
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
// the front matter of a dedicated headless page (contentDir/cc-dispatch), so
// real pages' front matter stays pristine; headless pages are invisible to
// site.Pages but resolvable via site.GetPage, and render no output of their
// own. The partial is validated with templates.Exists because errorf can't
// carry a message back through the build (Hugo only reports "logged N
// errors").
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

	// TemplateOverrides maps a normalized partial name to the reserved partial
	// name ("__cc_overrides/N.html") that renders the override source verbatim,
	// sidestepping Hugo's name-based partial lookup (project shadows theme).
	TemplateOverrides map[string]string
}

// editorFlags returns the renderer-owned config overrides applied on top of
// the site's own config (which loadConfig reads through Hugo's default-name
// search). disableKinds trims every rebuild to content pages only; the
// cascade suppresses per-page output so pages stay in the store while only
// the home page (and anything opted into publishing via front matter) emits
// HTML.
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
		// Only mirrored modules (the theme and vendored modules) can resolve in
		// the in-memory fs; skip unresolvable imports such as the
		// editable-regions module, whose replacement points at the repo on disk.
		IgnoreModuleDoesNotExist: true,
	})
	if err != nil {
		return err
	}

	// Rebuilds run through Hugo's incremental change-event pipeline, so enable
	// Running/Watch and propagate them to the per-language configs (the
	// `hugo.*` template namespace reads from these).
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

	// Each build consumes the pending change events; replaying stale ones on
	// later builds would force a full "template changed" re-render.
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

// normalizePartialName strips a trailing template extension so override keys
// match the render request regardless of ".html"/".htm" (mirroring Hugo's
// extension-tolerant partial lookup).
func normalizePartialName(name string) string {
	name = strings.TrimSuffix(name, ".html")
	name = strings.TrimSuffix(name, ".htm")
	return name
}

// installTemplateOverrides mirrors each override source into a reserved partial
// under the resolved layout dir's partials tree and records the normalized name
// -> reserved partial name mapping. Rendering an override resolves to its
// reserved name, so the exact override file renders regardless of Hugo's normal
// partial lookup order (project shadows theme) or name collisions.
func (builder *editorSiteBuilder) installTemplateOverrides(overrides map[string]string) {
	builder.TemplateOverrides = make(map[string]string, len(overrides))
	if len(overrides) == 0 {
		return
	}

	basePartialDir := filepath.Join(builder.Cfg.Base.LayoutDir, "partials")

	// Deterministic reserved names: sort the override keys.
	keys := make([]string, 0, len(overrides))
	for name := range overrides {
		keys = append(keys, name)
	}
	sort.Strings(keys)

	i := 0
	for _, name := range keys {
		src := filepath.Clean(overrides[name])
		contents, err := builder.readFile(src)
		if err != nil {
			// A missing source is a config mistake; skip it rather than fail boot.
			fmt.Println(fmt.Sprintf("template override %q: source %q not found: %s", name, src, err))
			continue
		}
		reserved := fmt.Sprintf("__cc_overrides/%d.html", i)
		i++
		builder.writeFile(filepath.Join(basePartialDir, reserved), contents)
		builder.TemplateOverrides[normalizePartialName(name)] = reserved
	}
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

// JSON numbers decode to float64, but whole numbers should stay ints so
// printf "%d" works and large ids don't render in scientific notation; this
// recursively converts integral float64s to int64 before the props are written
// as YAML front matter. Values beyond the int64 range stay floats.
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

	// The home stub is the render fallback and boot surface, so it survives
	// delete events regardless of what the browser sends; only a post-init
	// config knows the content dir, so the path is guarded on that.
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

// initHugoEditorSite creates the Hugo site from the files written so far,
// installing the editor layout and a stub content file so the first build
// always has a renderable page. Config is loaded through Hugo's own
// resolution so paths come from the site's real config; renderer overrides
// ride on top via editorFlags.
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	var overrides map[string]string
	if len(args) > 0 && args[0].Type() == js.TypeString && args[0].String() != "" {
		if err := json.Unmarshal([]byte(args[0].String()), &overrides); err != nil {
			return errorValue("bad template overrides: %s", err)
		}
	}

	// Load config first so the dispatch layout and stub can be written under
	// the resolved layoutDir/contentDir and exist before the site is created.
	if err := builder.loadConfig(); err != nil {
		return errorValue("failed to load config: %s", err)
	}

	layoutDir := builder.Cfg.Base.LayoutDir
	contentDir := builder.Cfg.Base.ContentDir
	builder.writeFile(filepath.Join(layoutDir, "all.html"), editorLayout)

	// The dispatch page must exist before the first build: every opted-in
	// page's layout depends on it via site.GetPage, and each render rewrites it.
	builder.writeFile(filepath.Join(contentDir, "cc-dispatch/index.md"), "---\nheadless: true\ncc_partial: \"\"\n---\n")

	// Only plant a placeholder home page when none arrived, so loader-provided
	// data is never clobbered; the home page's publishing comes from the cascade.
	homeStub := filepath.Join(contentDir, "_index.md")
	if _, err := builder.Afs.Stat(homeStub); os.IsNotExist(err) {
		builder.writeFile(homeStub, "---\ncc_initialized: true\n---\n")
	}

	// Override templates are mirrored after config resolves the layout dir (and
	// before the site is created), so their reserved partials are registered for
	// the first build.
	builder.installTemplateOverrides(overrides)

	if err := builder.createSites(); err != nil {
		return errorValue("failed to create site: %s", err)
	}
	if err := builder.build(); err != nil {
		return errorValue("initial build failed: %s", err)
	}
	return nil
}

// rebuildHugoEditorSite runs an incremental build so the browser's site-wide
// content stubs are re-read before the next render, keeping the dispatch
// write alone in its own build (the single-content-write-per-build invariant).
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
	// ("content/blog/one.md"), matched after the build against the built page's
	// content-relative File().Path() so the render reads the exact edit target;
	// empty or unmatched falls back to the home page. The target is fixed at
	// boot and never changes mid session.
	Target string `json:"target"`
}

// renderOutputPath returns the built HTML path for a permalink, e.g. "/"
// -> public/index.html, "/blog/one/" -> public/blog/one/index.html.
func renderOutputPath(permalink string) string {
	rel := strings.Trim(permalink, "/")
	if rel == "" {
		return "public/index.html"
	}
	return "public/" + rel + "/index.html"
}

// targetOutputPath resolves the built output to read for a render: the page
// whose source file path matches target, or the home page when target is
// empty or matches no page. Matching by file path (not page identity) is
// exact — Hugo's own file->page mapping.
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

	// A template override (name -> reserved partial) replaces the natural
	// partial lookup for that name, rendering the exact override source.
	partialName := req.Partial
	if reserved, ok := builder.TemplateOverrides[normalizePartialName(req.Partial)]; ok {
		partialName = reserved
	}

	contentDir := builder.Cfg.Base.ContentDir

	// The dispatch page carries the render request; every opted-in page depends
	// on it, so rewriting it makes the edit target stale and re-rendered. It's
	// headless (never appears in site.Pages or emits output) so real pages'
	// front matter stays pristine. Its front matter is YAML (not JSON) so props
	// keep their types: JSON would decode whole numbers to floats, breaking
	// printf "%d" and large-id rendering; goccy/go-yaml is Hugo's own decoder.
	frontMatter, err := yaml.Marshal(map[string]interface{}{
		"headless":   true,
		"cc_partial": partialName,
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
