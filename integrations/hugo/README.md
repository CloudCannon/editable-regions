# Hugo live-editing runtime

Live-editing of Hugo components inside the CloudCannon Visual Editor: the
editor re-renders a component partial client-side as the user edits its data,
without round-tripping through a Hugo build.

Unlike the other integrations, the build-time half is **pure Hugo** — there is
no Node plugin, CLI, or post-build step. Hugo has no plugin system, so this
integration is packaged as a Hugo module (or theme) that does its work with
three first-party mechanisms:

1. **A custom output format** (`editable-regions`) whose template runs during
   the normal `hugo` build and emits `/register-components.js`: a snapshot of
   the site's partials and data files, a normalized site config, and a page
   map resolved from `.Site.Pages`.
2. **Theme-contributed configuration** for the output format and media type
   (Hugo deep-merges `outputFormats`/`mediaTypes`/`params` from modules).
3. **Static assets**: a prebuilt browser runtime (`runtime.js`) and the Hugo
   renderer compiled to WASM (`hugo_renderer.wasm.gz`), copied into the site
   output like any other theme static file.

In the browser, the runtime boots a real Hugo (via WASM) from the emitted
snapshot and registers `window.cc_components` renderers. The shared
editable-regions core does everything else: hydration, `data-prop` binding to
the CloudCannon API, DOM diffing, editors, and error cards.

## Install and configure

Add the module to the site (any of: `hugo mod get`, a theme submodule, or a
local `themesDir` entry), then:

```toml
# hugo.toml
theme = "editable-regions"       # or [[module.imports]]

# The one line a module can't contribute — Hugo doesn't merge slice values
# from themes — enables the emitter on the home page:
[outputs]
  home = ["HTML", "editable-regions"]
```

Load the bundle in the site's `<head>`:

```go-html-template
{{ partial "cc/live-editing-head.html" . }}
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
  runtime_url = ""                      # override the runtime script URL
  wasm_url = ""                         # override the renderer WASM URL
  verbose = false                       # console logging in the editor
```

## How it fits together

```
hugo build
  ├── site pages (normal HTML output, with data-editable annotations)
  └── register-components.js        <- output format template (this module)
        window.cc_hugo_files        <- layouts/partials/** snapshot
        window.cc_hugo_data         <- data/** snapshot
        window.cc_hugo_config       <- baseURL, title, params, menus
        window.cc_hugo_pages        <- input path -> URL (from .Site.Pages)
        └── loads runtime.js        <- prebuilt IIFE (this repo)
              └── hugo_renderer.wasm.gz   <- real Hugo, in the browser
```

The WASM renderer holds a `hugolib` site over an in-memory filesystem. At
startup it receives the snapshot (config, partials, data); each component
render rewrites one content file and runs an incremental build — sub-millisecond
in practice. The runtime only fetches the WASM once the CloudCannon Visual
Editor API announces itself, so shipping `register-components.js` on
production pages costs one small script, not a 15MB download.

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
  the gzipped binary into `hugo-module/static/`. `node verify-renderer.mjs`
  smoke-tests the render surface in Node.
- `browser/` — the runtime source. `node integrations/hugo/build-runtime.mjs`
  bundles it (IIFE) into `hugo-module/static/`.
- `hugo-module/` — the distributable Hugo module: config, emitter output
  format, annotation partials, and the built static assets (gitignored;
  built by the two commands above, which `npm run build:hugo` chains).
- `test/integrations/hugo/` — fixture site consuming the module via
  `themesDir`; `npm run build` inside it builds with Hugo and runs
  `verify-bundle.mjs`, which checks the emit contract and then boots the
  real WASM from the emitted data and asserts an editor render matches the
  build-time HTML.
