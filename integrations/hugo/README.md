# Hugo live-editing runtime

Live-editing of Hugo components inside the CloudCannon Visual Editor: the
editor re-renders a component partial client-side as the user edits its data,
without round-tripping through a Hugo build.

Unlike the other integrations, the build-time half is **pure Hugo** — there is
no Node plugin, CLI, or post-build step, and the site needs **no configuration
at all**. Hugo has no plugin system, so this integration is packaged as a Hugo
module (or theme) that does its work with two first-party mechanisms:

1. **Partials + the asset pipeline**: a single partial in the site's `<head>`
   builds the live-editing bundle through Hugo Pipes — the snapshot prelude
   (template sources, data files, normalized site config, and a page map
   resolved from `.Site.Pages`) concatenated with the prebuilt runtime,
   fingerprinted, and emitted as one `<script>` tag with SRI.
2. **Module assets**: the prebuilt browser runtime (`runtime.js`) and the
   Hugo renderer compiled to WASM (`hugo_renderer.wasm.gz`) ship in the
   module's `assets/`, so they ride the resource pipeline (fingerprinted,
   cache-safe URLs) rather than being copied verbatim from `static/`.

In the browser, the runtime boots a real Hugo (via WASM) from the emitted
snapshot and registers `window.cc_components` renderers. The shared
editable-regions core does everything else: hydration, `data-prop` binding to
the CloudCannon API, DOM diffing, editors, and error cards.

## Install and configure

Add the module to the site (any of: `hugo mod get`, a theme submodule, or a
local `themesDir` entry):

```toml
# hugo.toml
theme = "editable-regions"       # or [[module.imports]]
```

That's the whole configuration. Load the bundle in the site's `<head>`:

```go-html-template
{{ partial "cc/live-editing-head.html" . }}
```

That partial emits a single fingerprinted `<script>` tag (SRI + `defer`)
containing both the site snapshot and the runtime. If you need control over
the tag — conditional loading, your own pipeline — call the function-style
partial instead and use the resource however you like:

```go-html-template
{{ $bundle := partial "cc/resources.html" . }}
```

Annotate components where they're rendered:

```go-html-template
{{ partial "cc/editable-component.html" (dict
  "component" "card.html"   # partial name, relative to layouts/partials
  "prop" "card"             # source path for the props (data-prop)
  "props" .Params.card      # the props to render with at build time
) }}
```

The `component` name doubles as the browser-side component key: the runtime
resolves it against the same `layouts/partials` tree, so the build-time render
and every editor re-render come from the same template. Other region types
(`data-editable="text|image|array|array-item|source"`) are plain attributes —
write them directly in your templates.

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
  │     └── <head>: {{ partial "cc/live-editing-head.html" . }}
  │           └── /cc-editable-regions/live-editing.<hash>.js
  │                 ├── snapshot prelude        <- cc/snapshot.html (this module)
  │                 │     window.cc_hugo_files  <- layouts/partials/** snapshot
  │                 │     window.cc_hugo_data   <- data/** snapshot
  │                 │     window.cc_hugo_config <- baseURL, title, params, menus
  │                 │     window.cc_hugo_pages  <- input path -> URL (from .Site.Pages)
  │                 │     window.cc_hugo        <- meta incl. fingerprinted WASM URL
  │                 └── runtime.js              <- prebuilt IIFE (this repo)
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
  the gzipped binary into `hugo-module/assets/`. `node verify-renderer.mjs`
  smoke-tests the render surface in Node.
- `browser/` — the runtime source. `node integrations/hugo/build-runtime.mjs`
  bundles it (IIFE) into `hugo-module/assets/`.
- `hugo-module/` — the distributable Hugo module: annotation partials, the
  snapshot/bundle pipeline partials, and the built assets (gitignored;
  built by the two commands above, which `npm run build:hugo` chains).
- `test/integrations/hugo/` — fixture site consuming the module via
  `themesDir`; `npm run build` inside it builds with Hugo and runs
  `verify-bundle.mjs`, which checks the emit contract and then boots the
  real WASM from the emitted data and asserts an editor render matches the
  build-time HTML.
