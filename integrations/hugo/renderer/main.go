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
//	initHugoEditorSite()      – load config.json and create the site
//	renderHugoPartial(json)   – {"partial": "card.html", "props": {...}}
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
const editorLayout = `{{ with site.GetPage "/cc-dispatch/" }}{{ if .Params.cc_partial }}{{ partial .Params.cc_partial .Params.cc_props }}{{ end }}{{ end }}`

type editorSiteBuilder struct {
	Cfg          *allconfig.Configs
	Afs          afero.Fs
	Fs           *hugofs.Fs
	Sites        *hugolib.HugoSites
	changedFiles []string
	removedFiles []string
}

func (builder *editorSiteBuilder) loadConfig() error {
	cfg, err := allconfig.LoadConfig(allconfig.ConfigSourceDescriptor{
		Fs:       builder.Afs,
		Flags:    config.New(),
		Filename: "config.json",
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

	for _, fileName := range removeFiles {
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
// The site config (written by the browser from the snapshot) carries the
// site's configured layoutDir/contentDir, so the dispatch layout and stub go
// where Hugo will actually look for them — not always "layouts"/"content".
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	// Load config first so the dispatch layout and stub can be written under
	// the site's configured layoutDir/contentDir. After that the original
	// write-then-create-then-build order is preserved: Hugo's first Running
	// build only re-renders everything when the files exist before the site
	// is created.
	if err := builder.loadConfig(); err != nil {
		return errorValue("failed to load config: %s", err)
	}

	layoutDir := builder.Cfg.Base.LayoutDir
	contentDir := builder.Cfg.Base.ContentDir
	builder.writeFile(filepath.Join(layoutDir, "all.html"), editorLayout)

	// The browser writes every content stub (including the home page's real
	// front matter, with build.render: always so it publishes under the
	// cascade) before init. Only plant a placeholder home page when none
	// arrived, so loader-provided data is never clobbered. `build.render:
	// always` on the placeholder keeps the home page emitting output even
	// when the site config carries the render: "link" cascade.
	homeStub := filepath.Join(contentDir, "_index.md")
	if _, err := builder.Afs.Stat(homeStub); os.IsNotExist(err) {
		builder.writeFile(homeStub, "---\ncc_initialized: true\nbuild:\n  render: always\n---\n")
	}

	if err := builder.createSites(); err != nil {
		return errorValue("failed to create site: %s", err)
	}
	if err := builder.build(); err != nil {
		return errorValue("initial build failed: %s", err)
	}
	return nil
}

type renderRequest struct {
	Partial string          `json:"partial"`
	Props   json.RawMessage `json:"props"`
	// The Hugo path of the page being edited ("/", "/blog/one/"); the render
	// reads that page's output, so the dispatch layout runs with the page as
	// its Page.
	Page string `json:"page"`
	// The edit target's content file (stub) to write this render: the real
	// front matter plus build.render: always, serialized by the browser. For
	// the home page this is the home stub; omitted when the browser had no
	// data for it (or for renderer-only callers), in which case a placeholder
	// is planted. Writing this file is the content change event that makes
	// the target stale and re-rendered — with the dispatch-page write below
	// it is the only per-render content write, so builds stay on the cheap,
	// incremental path.
	PageFile *pageFileSpec `json:"pageFile"`
}

type pageFileSpec struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// Where the built site writes the page at the given editor path: "/" is the
// home page (public/index.html); "/blog/one/" renders to
// public/blog/one/index.html.
func renderOutputPath(page string) string {
	rel := strings.Trim(page, "/")
	if rel == "" {
		return "public/index.html"
	}
	return "public/" + rel + "/index.html"
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

	if req.Page == "" {
		req.Page = "/"
	}

	contentDir := builder.Cfg.Base.ContentDir

	// The target stub write makes the target page stale for this build. The
	// browser's serialized stub carries the page's real front matter plus the
	// build.render opt-in (the home page's stub is always opted in). Without
	// one — renderer-only callers — plant the home placeholder.
	pageFile := req.PageFile
	if pageFile == nil {
		pageFile = &pageFileSpec{
			Path:    filepath.Join(contentDir, "_index.md"),
			Content: "---\ncc_initialized: true\nbuild:\n  render: always\n---\n",
		}
	}
	builder.writeFile(pageFile.Path, pageFile.Content)

	// The dispatch page carries the render request: partial and props. It's
	// headless so it never appears in site.Pages/AllPages or emits output of
	// its own, and only the dispatch layout (via site.GetPage) ever reads it —
	// real pages' front matter stays pristine. Its front matter is YAML (not
	// JSON) so props keep their types: JSON decodes every number as float64,
	// turning whole numbers into floats (printf "%d" fails, large ids print
	// in scientific notation). goccy/go-yaml is the same library Hugo's
	// front-matter decoder uses, and it quotes ambiguous strings (e.g.
	// date-looking values) so they stay strings. Keys keep their exact case
	// either way.
	frontMatter, err := yaml.Marshal(map[string]interface{}{
		"headless":   true,
		"cc_partial": req.Partial,
		"cc_props":   integralizeNumbers(props),
		"cc_page":    req.Page,
	})
	if err != nil {
		return errorValue("failed to encode request for %s: %s", req.Partial, err)
	}
	builder.writeFile(filepath.Join(contentDir, "cc-dispatch/index.md"), "---\n"+string(frontMatter)+"---\n")

	if err := builder.build(); err != nil {
		return errorValue("%s", err)
	}

	outputPath := renderOutputPath(req.Page)
	html, err := builder.readFile(outputPath)
	if err != nil {
		return errorValue("build produced no output at %s for %s: %s", outputPath, req.Partial, err)
	}

	return js.ValueOf(map[string]interface{}{
		"html": html,
	})
}
