# Hugo integration: handoff (2026-08-13)

Living design record for `feat/hugo-editable-regions`. The original design
doc (`hugo-integration-shape.md`) predates this — where they disagree, this
document wins. Commit-by-commit history lives in git; this doc records the
current shape, the decisions behind it, probe-verified gotchas, and what's
left to do.

## Current shape

Architecture in one paragraph: the consuming site adds
`[[module.imports]] path = "github.com/cloudcannon/editables"` and
`{{ partial "editable-regions" . }}` in its `<head>`. The repo-root
`hugo.toml` mounts `hugo-module/{layouts,assets}`, `integrations/hugo/browser`,
and `helpers/` into the virtual FS (at repo-relative paths, so import
specifiers inside the sources resolve identically when mounted).
`editable-regions/resources.html` builds a snapshot context (project
template walk + theme/vendored-module walk + site-config partial +
fingerprinted WASM URL), renders the entry asset `browser/entry.js` with it
via `resources.ExecuteAsTemplate`, bundles with `js.Build` (minify off under
`hugo.IsDevelopment`), fingerprints, and `editable-regions.html` emits the
single `<script>` (SRI + defer).

In the browser the runtime boots real Hugo (GOOS=js WASM, hugolib over afero
memfs) lazily once the CloudCannon API appears, then:

- **Templates**: project partials/render hooks/shortcodes are discovered by a
  salient-folder walk of the physical tree (`walk-project.html`), validated
  with `templates.Exists`, and keyed canonically under `layouts/`. Theme and
  vendored-module templates come from `walk-modules.html`. Kind layouts are
  excluded everywhere (dispatch-layout shadowing rule).
- **Content + data** (mirrored at boot, never snapshotted): every CloudCannon
  collection item becomes a content stub (front matter only, blank body) and
  every dataset item a data file, each written **verbatim at its source
  path** under the editor's default `content/`/`data/`. The home page and the
  boot-time current page (fixed for the session) opt into publishing with
  `build.render: always` under the editor config's `cascade: build.render:
  "link"` — the only pages that ever emit output.
- **Freshness**: the runtime subscribes to each mirrored collection's and
  dataset's `change`/`delete` events; a change re-fetches the file, rewrites
  its stub/data file, and runs a build-only rebuild — one write per build,
  preserving the single-write invariant.
- **Rendering**: each component render rewrites only the headless `cc-dispatch`
  request page (`partial` + props via goccy YAML front matter) and runs an
  incremental build; the current page re-renders through its dependency on
  the dispatch page, so components see `page` bound to the edit target.

## Decisions made (with rationale)

1. **Packaging: repo root is the module** (option A). Existing `v*` semver
   release tags double as module versions. Caveat: at v2+ the module becomes
   `+incompatible` (no root go.mod) — still fetchable, revisit then.
2. **Bundling: `js.Build` at Hugo build time** via `ExecuteAsTemplate` on the
   real entry asset with relative imports (chosen over FromString + bare
   imports). Verified: relative imports resolve across mount boundaries.
3. **No release-side JS build.** The only release-side artifact is the WASM
   (Hugo can't compile Go). A full-TS rewrite would bundle via js.Build
   transparently.
4. **Module-local logger** (`browser/logger.mjs`); no import from the Liquid
   integration.
5. **Partial API**: `{{ partial "editable-regions" . }}` (head include),
   internals under `editable-regions/`. Annotations are plain wrapper markup,
   documented in the README; the auto-emitted component wrapper and the `cc/`
   namespace are gone.
6. `gzip -n` in `renderer/build.sh` — deterministic WASM bytes so
   fingerprint URLs only churn on real changes.
7. CI: `test.yml` sets up Go and Hugo 0.164.0 extended (the fixture couldn't
   run in CI before).
8. **GOOS=js is the settled target**; wasip1 was evaluated and deferred (no
   file-change notifications, no lazy fetch inside a syscall, vanilla CLI
   doesn't compile) — remains a valid glue swap only if `wasm_exec.js`
   maintenance ever hurts.
9. **No `tplimpl` seam hunt.** Direct compiled-partial execution would couple
   us to private Hugo internals; the per-render incremental build stays.
10. **Content loads front matter only** (blank bodies in the editor); full
    bodies stay unloaded until a demonstrated need. The dependency-walk
    refinement is still future.
11. **Full-site rendering is suppressed with build options, not
    `disableKinds`** (probe-verified): editor config gets
    `cascade: [{build: {render: "link"}}]`; home + the boot-time current page
    opt in with `build: {render: always}`. Pages stay in the store
    (collections/.Content/.RelPermalink all work) while only opted-in pages
    publish.
12. **The page map is removed.** `window.cc_hugo_pages`/`runtimeData.pages`
    are gone — the CloudCannon API already enumerates files at runtime;
    re-add only when a concrete consumer defines what it needs.
13. **Custom directories — SUPERSEDED (2026-08-13) by the salient walk +
    collections/datasets model.** The old `layout-dirs.html` config probe is
    deleted and no dir values are forwarded anywhere. The template walk is
    layoutDir-agnostic, so relocated *layout* dirs work with zero config
    awareness. `template_dirs` stays **override-only** (the user's call): when
    set it replaces the walk and the dirs are walked verbatim — project-level
    `module.mounts` remain the escape-hatch case (walk and mounts can't
    overlap per Hugo docs). The editor site always uses Hugo's default
    `content`/`data`; relocated *content/data* dirs stay invisible (verbatim
    mirroring) until directory-config mirroring lands — future work.

## Hugo gotchas (probe-verified, worth knowing)

- **`os.*` template funcs see NO files in the WASM renderer**: os.ReadFile/
  FileExists return empty/false for everything in the editor site. Hence the
  **headless dispatch page** (`<contentDir>/cc-dispatch`, read via
  `site.GetPage`) as the render request channel: normal front-matter path,
  no template fs access, invisible to `site.Pages`/`AllPages`/`RegularPages`,
  emits no output, resolves via `site.GetPage` (verified natively + in the
  WASM).
- **Natively, `os.*` reads Hugo's UNION filesystem but directory listings are
  pre-mount physical**: `readDir "layouts/partials"` lists only the project's
  physical entries, while `readFile`/`fileExists` on the same path DO resolve
  theme files (a theme-overlay fall-through), and physical `themes/<n>/...`
  paths enumerate fine. Consequence 1: theme/vendor capture walks physical
  dirs and remaps keys. Consequence 2: the walk cannot sweep up the module's
  own mounted partials (verified against built fixture snapshots). Also: an
  imported module's root `hugo.toml` appears at the union path "hugo.toml" —
  relevant if anything ever probes config again.
- **Multi-content-change builds skip newly-opted pages**: a build whose change
  set contains ≥2 user content writes silently fails to render a page whose
  `build.render` was just flipped to `always`. Single-write-per-build is rock
  solid (20-render burst verified). **Never batch two content writes into one
  build** — this is why freshness rebuilds immediately after each write.
- **No multi-line string literal exists in Hugo templates**: a raw newline in
  `"…"` is a parse error, and backtick raw strings don't exist. `"\n"` escapes
  work and a `partial` result is assignable, but `template`/`block`
  invocations are not.
- **Template string literals can't span physical lines either** (same parse
  error, whole build dies). The module partials are lint-excluded — **keep
  them out of formatter runs**, and remember **fixture bundles are
  gitignored, so `npm test` never rebuilds them**: a broken module source
  hides behind last-known-good bundles until a fresh `test:build-fixtures`.
- **`disableKinds` behaves differently between the WASM renderer and the
  native CLI**: with identical config, `site.Pages` excludes the auto-built
  taxonomy/term pages in the WASM but the native CLI keeps them. Matters only
  when taxonomy mirroring lands (see Open items).
- **Under the render-link cascade, a page's list surfaces only its direct
  children**: home's `.Pages`/`.RegularPages` show the section + top-level
  pages, not descendants under a `link` section; the section's own list and
  global `site.RegularPages` include everything. Same natively and in the
  WASM.
- **Home `.Date` defaults to the site's latest content date** when the stub
  has no explicit `date` — give fixture/mock home files an explicit date.
- **`with` + `return` + `:=` trap**: inside `{{- with x -}}`, a following
  `{{- $v := ... -}}` parses as `with`'s else-assignment; and a piped
  `return (...)` inside `with` rebinding `.` broke `ExecuteAsTemplate`'s
  argument order. Fix: plain `if not` guard, named variable, then pipe.
- **Relative module `replacements` resolve against `themesDir`** (`createThemeDirname`),
  not the project dir — the fixtures' `..` count accounts for this. With a
  local replacement no Go toolchain or network is needed to build.
- **`js.Build` import resolution**: bare imports resolve against the unified
  assets FS, then the project's `node_modules`. Auto-extension list is
  `{js,ts,tsx,jsx}` — use explicit `.mjs`.
- Fingerprinted assets accumulate in `public/` across rebuilds
  (`--cleanDestinationDir` only reconciles `static/`); the fixtures do a real
  `rm -rf public resources`.
- **What hugolib reads, and when** (read-trace, afero wrapper): `content/`,
  `data/`, `i18n/`, `layouts/` are read fully at initial build (walked trees
  are all-or-nothing — an absent `content/` silently empties collection
  partials); `assets/` is lazy. Incremental builds re-read only the changed
  file + its directory listing.
- **Front-matter build options**: the key is `build` (not `_build`, removed in
  0.145). `build.render`: `always` (default), `never` (in store, `.RelPermalink`
  empty), `link` (in store, permalink works, no output); `.Content`/`.Summary`
  of link/never pages render on demand from other pages.
- **`{{< ... >}}` is a parse error inside a partial** — carry shortcode calls
  in data (a `body` prop run through `markdownify`) so the render-mode lexer
  expands them.
- **Data files need map roots**: a scalar-root `data/*.yaml` hard-errors the
  whole build (`unexpected data type string`); data fixtures stay map-shaped.
- **Init ordering in the renderer**: `loadConfig()` must run *before* the
  dispatch layout + stub files are written — they must exist before
  `createSites()` or Hugo's first Running build won't re-render.

## Landed features (reference, in one place)

- **WASM distribution**: the renderer is gitignored (not in the module zip).
  `wasm-url.html` reads the module's resolved version from `hugo.Deps`
  (`eq .Path "github.com/cloudcannon/editables"` → `.Version`; trims the
  leading `v` and `+incompatible`), fetches the pinned release asset with
  `resources.GetRemote` at consumer build time, publishes under
  `public/_cloudcannon/`, fingerprints. Overrides: `params.editable_regions.
  wasm_url` (full URL), `_version` (wins over hugo.Deps), `wasm_base_url`.
  An explicit `_version = "0.0.0-dev"` or an empty resolved version falls
  back to the locally built module asset; commit-pinned consumers get an
  actionable `errorf`. Gotchas: `GetRemote` fails on media type for
  `.wasm.gz` (fine, we only publish bytes) and returns nil on 404 (guard
  before `resources.Copy`); `resources.Copy` takes `(target, resource)`.
- **Collections/datasets mirroring** (`browser/index.mjs`): boot calls
  `CloudCannon.collections()`/`datasets()`, mirrors items verbatim (source
  path minus leading slash) under `content/`/`data/` before
  `initHugoEditorSite`, then subscribes per collection/dataset. Dataset
  contents serialize by extension: YAML via `serializeData` (bare doc, array
  roots OK), JSON via `JSON.stringify` (float64 decoding matches Hugo's
  native JSON data); TOML/CSV datasets fall back to YAML (known gap — the
  API only exposes parsed data). `contentDir()`/`relContentFile`/
  `CONTENT_EXTENSIONS`/the old page maps are gone; `partialsPrefix()` is the
  fixed `layouts/partials/`.
- **Theme + vendored-module capture** (`walk-modules.html` +
  `module-templates.html`): themes are `hugo.Deps` entries whose physical
  `themes/<Path>` exists; vendored modules are `Vendor=true` deps walked
  from `_vendor/<Path>`; each module's own config is probed for
  `module.mounts` (source→logical-target mapping); first-wins per logical
  path with project files merged last (project wins). Content/data from
  those layers stay uncaptured; non-vendored imports are unreachable
  (module cache) — `hugo mod vendor`, `template_dirs`, or a local copy.
- **Props typing**: props travel as goccy YAML front matter on the dispatch
  page (not JSON — JSON decodes every number as float64); `integralizeNumbers`
  canonicalizes integral floats to ints; date-looking strings stay quoted.
  `printf "%d"` works on whole numbers and large ids.

## Open items (in suggested order)

- **Mirror the site's configured taxonomies** (design settled, not landed).
  Tag clouds/`site.Taxonomies`/term `site.GetPage` render wrong because the
  WASM builds Hugo's default dimensions and taxonomy/term kinds are disabled.
  Plan: extract `taxonomies` from the site config with an `os.ReadFile` +
  `transform.Unmarshal` probe (templates can't read the config —
  `site.Config.Taxonomies` doesn't exist on v0.164.0); forward in the
  snapshot + `buildEditorConfig`; remove "taxonomy"/"term" from
  `DISABLED_KINDS` (the cascade already suppresses their output); verify
  `site.Taxonomies` membership and term resolution in the WASM. Terms come
  only from loaded stubs' front matter.
- **Directory-config mirroring**: relocated `contentDir`/`dataDir` trees are
  currently invisible to the editor (verbatim mirroring under default dirs).
  Design how the runtime learns the site's dirs without resurrecting a
  fragile config probe.
- **Dependency-walk loading (the big optimization)**. Hugo's own dependency
  tracker (public API: `identity.WalkIdentitiesDeep` over rendered pages;
  partials chain their managers into the caller) could drive fetching front
  matter for exactly the files a component touched, leaving the rest
  unloaded. Loop: render → walk deps → fetch touched files → rebuild →
  fixpoint; treat `identity.GenghisKhan` as a broad-fetch fallback. Known
  hole: value predicates evaluated inside Go (`where` on `.Params.*`) record
  nothing. Empirically confirmed: the home page re-renders on dispatch-page
  changes through exactly this chain. (A fault-and-settle afero wrapper was
  evaluated and superseded by this.)
- **Exotic filenames**: the JS slugifier approximates Hugo's `urlize`;
  unicode/spacey source paths may diverge page paths. Revisit if a consumer
  hits it.
- **Bodies remain blank** until a demonstrated need (decision 10).
- **Small**: WASM startup readiness is a `setTimeout(10ms)` poll for
  `globalThis.renderHugoPartial` — the Go side could signal explicitly.
  `walk-dir.html` merges in a loop (O(n²)) — fine at partial scale.
  `hugo-integration-shape.md` describes the superseded output-format plan;
  keep as historical record or refresh.
