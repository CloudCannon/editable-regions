package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"strings"
	"syscall/js"

	"github.com/fsnotify/fsnotify"
	"github.com/gohugoio/hugo/common/hmaps"
	"github.com/gohugoio/hugo/config"
	"github.com/gohugoio/hugo/config/allconfig"
	"github.com/gohugoio/hugo/deps"
	"github.com/gohugoio/hugo/hugofs"
	"github.com/gohugoio/hugo/hugolib"
	"github.com/gohugoio/hugo/parser/metadecoders"
	"github.com/gohugoio/hugo/resources/page"
	"github.com/spf13/afero"
)

// dispatchView is the view renderBatch executes for each batch: the batch's
// requests arrive as template data (keyed by render id), and each request's
// partial renders with `page` bound through the execution context, keying
// every result with its request id for the browser to demultiplex.
const dispatchView = `{{- with .cc_requests -}}
  {{- /* cc_requests is a MAP keyed by render id, prepared on the Go side with
     Hugo's params preparation: it recurses into nested maps (not arrays),
     keeping case-insensitive Params semantics for props. Range order is
     key-sorted; the browser demuxes by id, not position. */ -}}
  {{- range $id, $req := . -}}
    {{- $partial := $req.partial -}}
    {{- $found := templates.Exists (printf "partials/%s" $partial) -}}
    {{- $found = or $found (templates.Exists (printf "partials/%s.html" $partial)) -}}
    {{- $found = or $found (templates.Exists (printf "partials/%s.htm" $partial)) -}}
    {{- if not $found -}}
      <div data-cc-render="{{ $id }}"><cc-missing-partial data-name="{{ $partial }}"></cc-missing-partial></div>
    {{- else -}}
      <div data-cc-render="{{ $id }}">{{- $result := try (partial $partial $req.props) -}}
      {{- if $result.Err -}}
        <cc-failed-partial data-name="{{ $partial }}" data-message="{{ $result.Err }}"></cc-failed-partial>
      {{- else -}}
        {{- $result.Value -}}
      {{- end -}}</div>
    {{- end -}}
  {{- end -}}
{{- end -}}`

// dispatchViewPath is the view's path inside the layouts mount, used to look
// it up in the template store.
const dispatchViewPath = "/_default/__cc-dispatch.html"

type editorSiteBuilder struct {
	Cfg          *allconfig.Configs
	Afs          afero.Fs
	Fs           *hugofs.Fs
	Sites        *hugolib.HugoSites
	changedFiles []string
	removedFiles []string
}

// editorFlags layers the editor's build posture on top of the site config:
// only kinds the editor can render against, and no page rendered during
// builds — pages exist as render targets only, and every render is the
// explicit on-demand __cc-dispatch view.
func editorFlags() config.Provider {
	flags := config.New()
	flags.Set("disableKinds", []string{"taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"})
	flags.Set("cascade", []interface{}{
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
		// Only mirrored modules (theme, vendored) can resolve in the in-memory fs;
		// skip imports whose replacement points at the repo on disk.
		IgnoreModuleDoesNotExist: true,
	})
	if err != nil {
		return err
	}

	// Rebuilds run through Hugo's incremental change-event pipeline, so enable
	// Running/Watch and propagate to per-language configs (read by the `hugo.*`
	// template namespace).
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

	builder.changedFiles = nil
	builder.removedFiles = nil

	if err == nil {
		if n := builder.Sites.NumLogErrors(); n > 0 {
			err = fmt.Errorf("logged %d errors", n)
		}
	}
	return err
}

// buildIfDirty runs an incremental build only when files changed since the
// last build, so renders with nothing pending skip the build entirely.
func (builder *editorSiteBuilder) buildIfDirty() error {
	if len(builder.changedFiles) == 0 && len(builder.removedFiles) == 0 {
		return nil
	}
	return builder.build()
}

func (builder *editorSiteBuilder) writeFile(filename, content string) {
	filename = normalizeMemfsPath(filename)
	if err := afero.WriteFile(builder.Afs, filepath.FromSlash(filename), []byte(content), 0755); err != nil {
		fmt.Println(fmt.Sprintf("Failed to write file: %s", err))
		return
	}

	builder.changedFiles = append(builder.changedFiles, filename)
}

func (builder *editorSiteBuilder) removeFile(filename string) {
	filename = normalizeMemfsPath(filename)
	if err := builder.Afs.Remove(filename); err != nil {
		fmt.Println(fmt.Sprintf("Failed to remove file: %s", err))
		return
	}

	// Publish-dir files aren't Hugo source files, so their removal shouldn't
	// be fed back in as a change event.
	if !strings.HasPrefix(filepath.ToSlash(filename), "public/") {
		builder.removedFiles = append(builder.removedFiles, filename)
	}
}

func (builder *editorSiteBuilder) readFile(filename string) (string, error) {
	filename = normalizeMemfsPath(filename)
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

// normalizeMemfsPath maps the browser's site-root-relative source paths
// ("/content/blog/one.md") to the in-memory fs's slash-less relative form,
// which Hugo's contentDir/dataDir/layoutDir also use.
func normalizeMemfsPath(p string) string {
	return strings.TrimPrefix(filepath.ToSlash(p), "/")
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
	js.Global().Set("renderHugoPartials", js.FuncOf(renderHugoPartials))
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

// initHugoEditorSite loads the site config and installs the editor view. It
// does not build: the browser calls it after writing the whole snapshot, and
// the first build waits until the first render batch (ensureBuilt), so the
// site's content tree is seeded from the complete file set. Every page builds
// as render:link (editorFlags), so builds publish nothing; batches render
// through the dispatch view with the edit target (or Hugo's empty page when
// the target is empty or unmatched) bound as `page` via the execution context.
func initHugoEditorSite(this js.Value, args []js.Value) interface{} {
	if err := builder.loadConfig(); err != nil {
		return errorValue("failed to load config: %s", err)
	}

	// The view renderBatch executes for each batch. Installed under _default/ —
	// the least-specific fallback, written after the snapshot load so it wins
	// its own path; only a kind- or section-specific __cc-dispatch view could
	// shadow it.
	builder.writeFile(filepath.Join(
		builder.Cfg.Base.LayoutDir, "_default", "__cc-dispatch.html"), dispatchView)
	return nil
}

// ensureBuilt creates the site and runs the first build, on the first render
// batch after init. By then every snapshot and API file is in the fs, so the
// build seeds Hugo's content tree from the complete set — Hugo cannot add a
// site's first content file on the incremental path later, so sites that boot
// with no content at all only pick up content after a full editor reload.
func (builder *editorSiteBuilder) ensureBuilt() error {
	if builder.Sites != nil {
		return nil
	}

	if err := builder.createSites(); err != nil {
		return fmt.Errorf("failed to create site: %w", err)
	}
	// The initial build walks the full in-memory fs, so everything written so
	// far is already reflected — feed none of it back in as change events.
	builder.changedFiles = nil
	builder.removedFiles = nil
	if err := builder.build(); err != nil {
		return fmt.Errorf("initial build failed: %w", err)
	}
	return nil
}

// renderRequests is the browser's queued batch: the one render target every
// request shares, plus the requests to render against it.
type renderRequests struct {
	// Verbatim site-root-relative source file of the page being edited
	// ("content/blog/one.md"), matched after the build against the page's
	// File().Path() so the render executes on the exact edit target; empty or
	// unmatched renders page-less (page binds to Hugo's empty page).
	// Fixed at boot, so the whole batch carries one target.
	Target   string          `json:"target"`
	Requests []renderRequest `json:"requests"`
}

type renderRequest struct {
	// Browser-assigned queue key; becomes the cc_requests map key and the
	// data-cc-render attribute the browser demultiplexes by. Must stay
	// lowercase: params preparation lowercases map keys.
	ID      string          `json:"id"`
	Partial string          `json:"partial"`
	Props   json.RawMessage `json:"props"`
}

// targetPage resolves the page a render batch targets: the page whose source
// file path matches target, or nil when target is empty or matches no page
// (the batch then renders page-less). Matching by file path (not page
// identity) is exact.
func (builder *editorSiteBuilder) targetPage(target string) page.Page {
	target = normalizeMemfsPath(target)
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
				return p
			}
		}
	}
	return nil
}

// renderHugoPartials renders a batch of queued partial-render requests in one
// call: every request shares the batch's target — the page being edited,
// fixed at boot — so one view render covers the whole batch, each request's
// output keyed by its ID and wrapped in <div data-cc-render="{id}"> so the
// browser can demultiplex the single returned string. Writes pending since
// the last build are folded in up front — nothing but renders consumes built
// state, so this is the only place a build is needed.
func renderHugoPartials(this js.Value, args []js.Value) interface{} {
	var payload renderRequests
	if err := json.Unmarshal([]byte(args[0].String()), &payload); err != nil {
		return errorValue("bad renderHugoPartials payload: %s", err)
	}
	reqs := payload.Requests
	if len(reqs) == 0 {
		return errorValue("renderHugoPartials requires at least one request")
	}
	// First call after init: create the site and run the first build against
	// the complete file set; later calls only rebuild pending changes.
	if err := builder.ensureBuilt(); err != nil {
		return errorValue("editor site build failed: %s", err)
	}
	if err := builder.buildIfDirty(); err != nil {
		return errorValue("editor site build failed after pending content changes: %s", err)
	}

	for _, req := range reqs {
		if req.Partial == "" {
			return errorValue("renderHugoPartials requires a \"partial\" name on every request")
		}
	}

	html, err := builder.renderBatch(payload.Target, reqs)
	if err != nil {
		return errorValue("%s", err)
	}

	return js.ValueOf(map[string]interface{}{
		"html": html,
	})
}

// renderBatch renders the batch's requests through the __cc-dispatch view —
// round-tripped through Hugo's YAML decoder and params preparation (the path
// front matter takes), so props keep identical types and case-insensitive
// Params semantics. The view executes with the edit target's page bound via
// the execution context, so every batched partial sees it as `page`.
func (builder *editorSiteBuilder) renderBatch(target string, reqs []renderRequest) (string, error) {
	requests := make(map[string]interface{}, len(reqs))
	for _, req := range reqs {
		var props interface{}
		if len(req.Props) > 0 {
			if err := json.Unmarshal(req.Props, &props); err != nil {
				return "", fmt.Errorf("bad props for %s: %s", req.Partial, err)
			}
		}
		requests[req.ID] = map[string]interface{}{
			"partial": req.Partial,
			"props":   props,
		}
	}
	// Decode the batch through Hugo's YAML decoder — the path the dispatch
	// page's front matter took — so props decode with identical types (whole
	// numbers as integers, not floats), then prepare params like front matter.
	encoded, err := json.Marshal(requests)
	if err != nil {
		return "", fmt.Errorf("failed to encode render batch: %s", err)
	}
	decoded, err := metadecoders.Decoder{}.UnmarshalToMap(encoded, metadecoders.YAML)
	if err != nil {
		return "", fmt.Errorf("failed to decode render batch: %s", err)
	}
	hmaps.PrepareParams(decoded)

	// The `page` template function (and partial decoration state) resolves
	// from the execution context, so prepare it the way hugo's own top-level
	// page renders do (see the alias handler's on-demand renders, which also
	// falls back to the empty page when there is none).
	renderTarget := builder.targetPage(target)
	if renderTarget == nil {
		renderTarget = page.NopPage
	}
	store := builder.Sites.GetTemplateStore()
	ctx := store.PrepareTopLevelRenderCtx(context.Background(), renderTarget)
	tmpl := store.LookupByPath(dispatchViewPath)
	if tmpl == nil {
		return "", fmt.Errorf("dispatch view %q not found", dispatchViewPath)
	}
	var out strings.Builder
	if err := store.ExecuteWithContext(ctx, tmpl, &out,
		map[string]interface{}{"cc_requests": decoded}); err != nil {
		return "", fmt.Errorf("failed to render the dispatch view for %q: %w", target, err)
	}
	return out.String(), nil
}
