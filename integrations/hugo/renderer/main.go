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
	"path/filepath"
	"strings"
	"syscall/js"

	"github.com/fsnotify/fsnotify"
	"github.com/gohugoio/hugo/config"
	"github.com/gohugoio/hugo/config/allconfig"
	"github.com/gohugoio/hugo/deps"
	"github.com/gohugoio/hugo/hugofs"
	"github.com/gohugoio/hugo/hugolib"
	"github.com/spf13/afero"
)

// The layout every render goes through: dispatches to the requested partial
// with the request's props as its context.
const editorLayout = `{{ if .Params.cc_partial }}{{ partial .Params.cc_partial .Params.cc_props }}{{ end }}`

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
	// enable Hugo's incremental change-event pipeline.
	cfg.Base.WorkingDir = ""
	cfg.Base.Internal.Running = true
	cfg.Base.Internal.Watch = true
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
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	builder.writeFile("layouts/all.html", editorLayout)
	builder.writeFile("content/_index.md", "{ \"cc_initialized\": true }\n")

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

	frontMatter, err := json.Marshal(map[string]interface{}{
		"cc_partial": req.Partial,
		"cc_props":   props,
	})
	if err != nil {
		return errorValue("failed to encode props for %s: %s", req.Partial, err)
	}

	builder.writeFile("content/_index.md", string(frontMatter)+"\n")

	if err := builder.build(); err != nil {
		return errorValue("%s", err)
	}

	html, err := builder.readFile("public/index.html")
	if err != nil {
		return errorValue("build produced no output for %s: %s", req.Partial, err)
	}

	return js.ValueOf(map[string]interface{}{
		"html": html,
	})
}
