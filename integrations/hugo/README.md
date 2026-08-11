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

**The renderer WASM is pulled at build time from the GitHub release
matching your module version** (determined from your own `go.mod` via
`hugo.Deps`, so it never drifts from what you imported), copied into
`public/_cloudcannon/`, and fingerprinted — the browser runtime then
loads it same-origin. Building the site therefore needs network access to
reach the release asset; development checkouts that mount the repo
directly (a local `replace`) fall back to the locally built WASM instead.

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
  wasm_url = ""                         # full override of the renderer WASM URL
  # Optional version override. Normally the version is auto-detected from
  # your module pin via hugo.Deps; set this to force a specific release
  # (e.g. themes-dir consumers or private mirrors). No leading "v".
  _version = ""
  # Base of the release download URL used when _version or the module pin
  # resolves to a release. Override when mirroring the assets.
  wasm_base_url = "https://github.com/CloudCannon/editable-regions/releases/download"
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
  └── /_cloudcannon/hugo_renderer.wasm.<hash>.gz   <- real Hugo, in the browser
        (pulled from the version-pinned GitHub release asset at build time,
         or the locally built WASM in development checkouts)
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
- The `site` global (components get props as their context, so use `site.*`,
  not `.Site.*`): `site.Params` (dotted paths, nested maps, arrays),
  `site.Title`, `site.Menus`, `site.Language` (`.Lang`, `.Locale` —
  `site.LanguageCode` is deprecated but still resolves), `site.BaseURL`,
  `site.Data`, and `site.Param "key"` — from the emitted config/data
  snapshots. Page collections (`site.Pages`, `site.RegularPages`,
  `site.Sections`) and `site.GetPage` read the editor site, which holds only
  the stub home page — safe but empty.
- The `hugo.*` namespace: `hugo.Version`, `hugo.Generator`,
  `hugo.Environment` (`"production"` in the editor), and
  **`hugo.IsServer` is `true` in the editor site** — guard editor-only
  branches with `{{ if hugo.IsServer }}`. `hugo.Data`/`hugo.Sites` mirror
  `site.Data`/`.Site` without the deprecated `.Site.Data`/`.Site.Sites`.
- Data files are queryable with the template helpers: `where`,
  `index`, `sort`, `default`, `len` across `site.Data.*`.
- **Props keep their types**: prop keys keep their exact case (camelCase
  and nested keys included), numbers render as integers (`printf "%d"`
  works; large ids don't flip to scientific notation) or floats, and
  date-looking strings stay strings. The renderer round-trips props
  through YAML front matter to preserve this.
- Props are delivered by the shared core from the CloudCannon API
  (`data-prop` source paths), so front-matter edits render live.

## Limitations and fallbacks

- **Page context**: components render with props as their context, not a
  `Page`, so they reach the site through the `site` global, not `.Site`.
  Page-scoped methods (`page.Resources`, `.Next`, `.IsHome`, …) aren't
  available, and the editor site holds no real content — `site.Pages` /
  `site.RegularPages` / `site.GetPage` come back empty or the stub home
  page (see open item: content loading). Keep content-props-driven, or
  guard editor-only branches with `hugo.IsServer`.
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
- **WASM availability**: the renderer is published as a GitHub release
  asset, so a pinned module version that isn't a release tag (e.g. a commit
  pin → pseudo-version) has no asset to fetch and the build fails with an
  actionable error. Pin `hugo mod get` to a release tag, or override
  `params.editable_regions.wasm_url` / `_version`. Consumers without a Go-
  module dependency (a copy under `themes/`) always need one of those
  overrides. Builds need network access to fetch the asset.

## Development (this repo)

- `renderer/` — the Go WASM renderer. `./build.sh` compiles it and installs
  the gzipped binary into `hugo-module/assets/` (gitignored; also what
  `npm run build:hugo` runs).
- `browser/` — the runtime source, mounted into the site's assets by the
  repo-root `hugo.toml`. `entry.js` is the bundle entry: a Go template
  rendered with the site snapshot (excluded from biome), bundled from
  source by `js.Build` at site build time — there is no release-side JS
  build.
- `hugo-module/` — the module's partials (`editable-regions` and the
  `editable-regions/` namespace) and the renderer WASM asset.
- `hugo.toml` (repo root) — the module itself: mounts exposing the
  partials, assets, runtime sources, and shared helpers.
- `test/unit/_fixtures/hugo/` — fixture site for the unit tests, built by
  `npm run test:build-hugo-fixture` (part of `test:build-fixtures`). It
  imports the module via a local `replacements` entry; note that relative
  replacement targets resolve against `themesDir`, not the project dir
  (hence five `..` levels from `test/unit/_fixtures/hugo`).
- `test/unit/hugo/` — the unit tests. `wasm-renderer.test.ts` boots the
  built WASM renderer directly (props, nested partials, data, error
  recovery, live template updates); `register`/`render`/`slots.test.ts`
  boot the fixture's real emitted bundle under vitest — a stubbed `fetch`
  serves the fingerprinted WASM — and drive components through the
  `window.cc_components` proxy (see `_helpers/hugo-bundle.ts`). Requires
  the renderer and fixture to be built first (`npm run build:hugo`).
- `test/integrations/hugo/` — fixture site importing the module via a
  local `replacements` entry, exactly as a real site would. Note that
  relative replacement targets resolve against `themesDir`, not the
  project dir (hence the four `..` levels). `npm run build` inside it
  builds the WASM and builds the site with Hugo.
