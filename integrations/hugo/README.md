# Hugo live-editing runtime

Live-editing of Hugo components inside the CloudCannon Visual Editor: the
editor re-renders a component partial client-side as the user edits its data,
without round-tripping through a Hugo build.

Unlike the other integrations, the build-time half is **pure Hugo** — there is
no Node plugin, CLI, or post-build step, and the site needs **no configuration
at all**. Hugo has no plugin system, so this integration is packaged as a Hugo
module that does its work with two first-party mechanisms:

1. **Partials + the asset pipeline**: a single partial in the site's `<head>`
   builds the live-editing bundle through Hugo Pipes — the runtime's entry
   asset is rendered with the site snapshot (template sources, data files,
   and normalized site config) via `resources.ExecuteAsTemplate`, bundled
   from source by `js.Build` (Hugo's
   embedded esbuild), fingerprinted, and emitted as one `<script>` tag with
   SRI.
2. **Module mounts**: the module is this repository's root; its `hugo.toml`
   mounts the partials, the renderer WASM (`hugo_renderer.wasm.gz`), and the
   browser runtime sources into the site's virtual filesystem.

In the browser, the runtime boots a real Hugo (via WASM) from the emitted
snapshot and registers `window.cc_components` renderers. The shared
editable-regions core does everything else: hydration, `data-prop` binding to
the CloudCannon API, DOM diffing, editors, and error cards.

## Install and configure

Import the module (requires the Go toolchain, as with any Hugo module):

```toml
# hugo.toml
[module]
  [[module.imports]]
    path = "github.com/cloudcannon/editables"
```

That's the whole configuration. Load the bundle in the site's `<head>`:

```go-html-template
{{ partial "editable-regions" . }}
```

That partial emits a single fingerprinted `<script>` tag (SRI + `defer`)
containing both the site snapshot and the runtime. If you need control over
the tag — conditional loading, your own pipeline — call the function-style
partial instead and use the resource however you like:

```go-html-template
{{ $bundle := partial "editable-regions/resources.html" . }}
```

Annotate components where they're rendered by wrapping the partial call in an
editable-component region:

```go-html-template
<div data-editable="component" data-component="card.html" data-prop="card">
  {{ partial "card.html" .Params.card }}
</div>
```

- `data-component` is the partial name, relative to `layouts/partials`. It
  doubles as the browser-side component key: the runtime resolves it against
  the same tree, so the build-time render and every editor re-render come
  from the same template.
- `data-prop` is the source path the shared core resolves live against the
  CloudCannon API (here: the front matter's `card` object). Omit it to render
  the component with empty props.
- `data-editable="component"` marks the region; other region types
  (`data-editable="text|image|array|array-item|source"`) are plain attributes
  written directly in your templates.

### Options (`params.editable_regions`)

```toml
[params.editable_regions]
  template_dirs = ["layouts/partials"]  # dirs snapshotted for the renderer
  data_dirs = ["data"]                  # data files available as site.Data
  template_extensions = [".html", ".htm"]
  wasm_url = ""                         # override the renderer WASM URL
  verbose = false                       # console logging in the editor
```

## How it fits together

```
hugo build
  ├── site pages (normal HTML output, with data-editable annotations)
  │     └── <head>: {{ partial "editable-regions" . }}
  │           └── /cc-editable-regions/live-editing.<hash>.js
  │                 entry.js (module asset) rendered with the site snapshot,
  │                 then bundled from source by js.Build:
  │                   window.cc_hugo_files  <- layouts/partials/** snapshot
  │                   window.cc_hugo_data   <- data/** snapshot
  │                   window.cc_hugo_config <- baseURL, title, params, menus
  │                   window.cc_hugo        <- meta incl. fingerprinted WASM URL
  │                   + the browser runtime (integrations/hugo/browser)
  └── /cc-editable-regions/hugo_renderer.wasm.<hash>.gz   <- real Hugo, in the browser
```

The WASM renderer holds a `hugolib` site over an in-memory filesystem. At
startup it receives the snapshot (config, partials, data); each component
render rewrites one content file and runs an incremental build — sub-millisecond
in practice. The runtime only fetches the WASM once the CloudCannon Visual
Editor API announces itself, so shipping the bundle on
production pages costs one small script, not a 16MB download.

## What works in editor renders

- Any partial rendering from its props: templating, nested partials,
  `partialCached` (as a plain partial), the full Hugo template function
  surface (`markdownify`, `where`, `printf`, `time`, …) — it's real Hugo.
- `site.Params`, `site.Title`, `site.Menus` — from the emitted config.
- `site.Data.*` — from the emitted data snapshot.
- Props are delivered by the shared core from the CloudCannon API
  (`data-prop` source paths), so front-matter edits render live.

## Limitations and fallbacks

- **Page context**: components render with props as their context, not a
  `Page`. `.Site`/`.Page` methods beyond the shims above (e.g. `.Site.Pages`,
  `.GetPage`, `.Resources`) aren't available — keep components props-driven,
  or guard editor-only branches with `hugo.IsServer`.
- **Assets**: `resources.*` image processing and `resources.GetRemote` have
  no asset pipeline in the editor. Emit final URLs into props instead.
- **Shortcodes** aren't processed inside `markdownify`.
- **Module-mounted templates**: the emitter walks the project directory
  (`readDir` can't see theme mounts), so partials provided by other modules
  need a local copy or an extra entry in `template_dirs`.
- **Version skew**: the WASM renderer pins its own Hugo version, which may
  differ from the site's. Template behavior is stable across versions for
  the component-scoped surface above, but brand-new template functions may
  lag behind.

## Development (this repo)

- `renderer/` — the Go WASM renderer. `./build.sh` compiles it and installs
  the gzipped binary into `hugo-module/assets/` (gitignored; also what
  `npm run build:hugo` runs). `node verify-renderer.mjs` smoke-tests the
  render surface in Node.
- `browser/` — the runtime source, mounted into the site's assets by the
  repo-root `hugo.toml`. `entry.js` is the bundle entry: a Go template
  rendered with the site snapshot (excluded from biome), bundled from
  source by `js.Build` at site build time — there is no release-side JS
  build.
- `hugo-module/` — the module's partials (`editable-regions` and the
  `editable-regions/` namespace) and the renderer WASM asset.
- `hugo.toml` (repo root) — the module itself: mounts exposing the
  partials, assets, runtime sources, and shared helpers.
- `test/integrations/hugo/` — fixture site importing the module via a
  local `replacements` entry, exactly as a real site would. Note that
  relative replacement targets resolve against `themesDir`, not the
  project dir (hence the four `..` levels). `npm run build` inside it
  builds the WASM, builds the site with Hugo, and runs
  `verify-bundle.mjs`, which checks the emit contract and then boots the
  real WASM from the emitted data and asserts an editor render matches
  the build-time HTML.
