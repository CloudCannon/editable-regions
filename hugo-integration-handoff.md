# Hugo integration: handoff (2026-08-11)

State of `feat/hugo-editable-regions` after a review/rework session. The
original design doc (`hugo-integration-shape.md`) predates this — where they
disagree, this document wins.

Updated same day after a follow-up design session: decisions 8–12 added
(GOOS=js settled, content-loading design, page-map removal); the open
items were rewritten to match. Items 2–4 below supersede their earlier
versions entirely.

Updated 2026-08-12 with the follow-ups that landed on the branch since:
WASM distribution (item 1), render-hook params coercion (item 3), and the
page-map/component-wrapper/globals items (item 5) all got their DONE
markers; the builtins battery and a new decision 13 (custom
layout/data/content directories) were added to the shape section.

## Current shape (committed)

- `8ce7a77` — teammate's initial working version (Go WASM renderer, output
  format emission).
- `59ed84b` — emission moved to Hugo Pipes: single fingerprinted bundle,
  `[outputs]` requirement deleted, WASM fingerprinted.
- `7a9b8e6` — runtime bundles **from source** via `js.Build` at site build
  time; the repo root is the module.
- `b43cccd` — bundle-path **builtins battery** for Hugo template functions
  (`test/unit/hugo/builtins.test.ts` + `builtins-probe.html`).
- `0ce1d0c` — **custom `layoutDir`/`dataDir`/`contentDir` respected
  end-to-end** (decision 13): config-file probe, snapshot walk + config
  passthrough, renderer writes under the configured dirs, dedicated
  fixture + tests.

Architecture in one paragraph: the consuming site adds
`[[module.imports]] path = "github.com/cloudcannon/editables"` and
`{{ partial "editable-regions" . }}` in its `<head>`. The repo-root
`hugo.toml` mounts `hugo-module/{layouts,assets}`, `integrations/hugo/browser`,
and `helpers/` into the virtual FS (at repo-relative paths, so import
specifiers inside the sources resolve identically when mounted).
`editable-regions/resources.html` builds a snapshot context (walk-files,
site-config partials + fingerprinted WASM URL), renders the entry
asset `browser/entry.js` with it via `resources.ExecuteAsTemplate`, bundles
with `js.Build` (minify off under `hugo.IsDevelopment`), fingerprints, and
`editable-regions.html` emits the single `<script>` (SRI + defer). In the
browser the runtime boots real Hugo (GOOS=js WASM, hugolib over afero memfs)
lazily once the CloudCannon API appears; each component render rewrites the
site's `<contentDir>/_index.md` (dirs resolved from the site config, decision
13; defaults `layouts`/`data`/`content`) and runs an incremental build.

## Decisions made (with rationale)

1. **Packaging: repo root is the module** (option A). Existing `v*` semver
   release tags double as module versions (`hugo mod get ...@vX.Y.Z`). The
   release workflow triggers on `v*`; subdirectory-module tags
   (`integrations/hugo/hugo-module/v*`) were rejected as a parallel tag
   stream. Caveat: at v2+ the module becomes `+incompatible` (no root
   go.mod) — still fetchable, revisit then. Module zip ≈ 430KB gz (mostly
   tests; nested `go.mod` dirs like `renderer/` are auto-excluded), cached
   per version in the Go module cache.
2. **Bundling: `js.Build` at Hugo build time**, 11ty-shaped — one template
   generates the esbuild entry. Mechanism: **ExecuteAsTemplate on a real
   entry asset with relative imports** (chosen over FromString + bare
   imports). Spiked and verified: relative imports resolve across mount
   boundaries in the unified assets FS; entry may live in a different
   physical mount than its imports.
3. **No release-side JS build.** `build-runtime.mjs` and the prebuilt IIFE
   are deleted. The only release-side artifact is the WASM (unavoidable —
   Hugo can't compile Go). The planned full-TS rewrite is compatible:
   `js.Build` transpiles TS from assets directly.
4. **Module-local logger** (`browser/logger.mjs`); the import of
   `integrations/liquid/logger.mjs` is gone.
5. **Partial API**: `{{ partial "editable-regions" . }}` (head include),
   internals under `editable-regions/` (resources, walk-*, site-config).
   Annotations are plain wrapper markup, documented in the README (an
   auto-emitted `editable-regions/component.html` wrapper was removed —
   zero consumers, and the hand-written form is as readable). `cc/`
   namespace deleted.
6. `gzip -n` in `renderer/build.sh` — deterministic WASM bytes so
   fingerprint URLs only churn on real changes.
7. CI: `test.yml` now sets up Go (`go-version-file` from
   `renderer/go.mod`) and Hugo 0.164.0 extended — the fixture previously
   could not run in CI at all.
8. **GOOS=js is the settled target** (session 2). wasip1 was evaluated
   thoroughly and deferred — evidence in the wasip1 item below. The
   short version: vanilla Hugo CLI doesn't compile to wasip1, WASI has
   no file notifications, and lazy fetch inside a syscall is impossible
   on the browser main thread.
9. **No `tplimpl` seam hunt** (session 2). Executing compiled partials
   directly would couple us to private Hugo internals for marginal gain;
   the per-render incremental build stays. The `.Params` coercion fix, if
   a test confirms it bites, is the JSON-string-param fallback (public
   API only), not a template-execution seam.
10. **Content loads in phases** (session 2): boot with templates + a
    content-file *listing* (from the CloudCannon API at runtime, not a
    build-time page map); when content is fetched, fetch **front matter
    only** and write stub content files with blank bodies. Full bodies
    stay unloaded until a demonstrated need appears.
11. **Full-site rendering is suppressed with build options, not
    `disableKinds`** (session 2, probe-verified on v0.164.0): editor
    config gets `cascade: [{build: {render: "link"}}]`; the dispatcher
    stub `content/_index.md` opts back in with `build: {render: always}`.
    Pages stay in the store (collections, `.Content`/`.Summary`, and
    permalinks all work — `render: "never"` would empty `.RelPermalink`)
    while only `index.html` is published.
12. **The page map is removed** (session 2): `window.cc_hugo_pages`
    emission, `runtimeData.pages`, and the `page-map.html` partial get
    deleted. The CloudCannon API already enumerates files at runtime;
    re-add a map only when a concrete consumer defines what it needs.
13. **Custom `layoutDir`/`dataDir`/`contentDir` are respected end-to-end**
    (2026-08-12). Sites configuring these previously broke silently: the
    default snapshot walked literal `layouts/`+`data/` and the renderer
    installed its dispatch layout + stub at literal `layouts/`+`content/`
    paths, so a relocated site bundled nothing and partials couldn't
    resolve. The shape now:
    - **Templates can't read config** (no accessor for the dir keys), so a
      new `editable-regions/layout-dirs.html` partial probes the config
      file(s) itself: first present of root `hugo.{toml,yaml,yml,json}` →
      legacy `config.{toml,yaml,yml,json}` → `config/_default/hugo.*`, read
      via `os.ReadFile` + `transform.Unmarshal` (explicit `format` from the
      filename — TOML has no auto-detect in the template layer), falling
      back to defaults. The snapshot's `data_dirs` and the default
      `template_dirs` walk both derive from it. **First-found-wins is an
      approximation**: Hugo merges `config/_default/*` *over* the root file
      per key, so a dir configured only in the config dir (with a root
      config present) is missed — sites virtually always set these at the
      root; revisit only if a consumer hits it.
    - The default walk scans `<layoutDir>/partials`,
      `<layoutDir>/_default/_markup` (render hooks), `<layoutDir>/shortcodes`,
      and `<dataDir>`. Kind layouts stay excluded — a real
      `<layoutDir>/_default/index.html` must not shadow the renderer's
      dispatch layout (tested). `browser/index.mjs` derives its
      partial-path prefix from `layoutDir` as well.
    - The renderer resolves dirs itself: `initHugoEditorSite` calls
      `loadConfig()` before writing the dispatch layout + stub to
      `Cfg.Base.LayoutDir`/`ContentDir`, and `renderHugoPartial` writes the
      stub under `ContentDir` (the write-then-create-then-build ordering is
      otherwise preserved — see the new gotcha).
    - Covered by a dedicated fixture (`hugo-custom-dirs`:
      `templates/`, `custom-data/`, `notes/`) + `test/unit/hugo/custom-dirs.test.ts`
      (8 tests), built via `test:build-hugo-custom-dirs` wired into
      `test:build-fixtures`.

## Hugo gotchas encountered (worth knowing)

- **`with` + `return` + `:=` trap**: in `{{- with x -}}`, a following
  `{{- $v := ... -}}` is parsed as `with`'s *else-assignment* clause; the
  variable doesn't exist in the body. And a piped `return (...)` inside
  `with` rebinding `.` broke `ExecuteAsTemplate` argument order (the page
  got passed as the resource: "type *hugolib.pageState not supported in
  Resource transformations"). Fix: plain `if not` guard, named variable,
  then pipe. See `editable-regions/resources.html`.
- **Relative module `replacements` resolve against `themesDir`**, not the
  project dir (`createThemeDirname` in `modules/client.go`). The fixture's
  `github.com/cloudcannon/editables -> ../../../..` has four `..` for this
  reason (`hugo-custom-dirs`, one level deeper, needs five). No themes
  dir is committed — the replacement still resolves during the build.
  With a local replacement, no Go toolchain or network is needed to
  build.
- `js.Build` import resolution: bare imports resolve against the unified
  assets FS, then fall back to the *project's* `node_modules`. Auto-extension
  list is `{js,ts,tsx,jsx}` — use explicit `.mjs` extensions.
- Fingerprinted assets accumulate in `public/` across rebuilds:
  `--cleanDestinationDir` only reconciles files that come from `static/`
  and leaves pipeline-generated resources behind — the fixture does a real
  `rm -rf public resources` instead.
- `resources.Concat` inserts `\n;\n` barriers between JS files (moot now —
  concat is gone — but good to know).
- **What hugolib reads, and when** (read-trace probe, v0.164.0, afero
  wrapper logging every read): `content/`, `data/`, `i18n/`, and
  `layouts/` are read **fully** at initial build (walked trees are
  all-or-nothing per tree — if `content/` is absent, nothing faults and
  collection partials silently render empty). `assets/` is **lazy** —
  read only when an executed template references a path via
  `resources.Get` et al. Incremental builds re-read only the changed
  file + its directory listing. Config load probes ~15 well-known paths
  (`go.mod`, `package.json`, `archetypes/`, `_vendor/`, ...).
- **Front-matter build options**: the key is `build`, not `_build`
  (`_build` was removed in Hugo 0.145). `build.render` values:
  `always` (default), `never` (in store, but `.RelPermalink` empty),
  `link` (in store, permalink works, no output rendered).
  `.Content`/`.Summary` of `link`/`never` pages render on demand when
  another page accesses them.
- **Templates can't read the site config** (decision 13): no template
  accessor exposes the `layoutDir`/`dataDir`/`contentDir` keys — only
  derived surfaces like `site.Params`, menus, and languages are reachable —
  so the integration parses the config file(s) from a partial
  (`layout-dirs.html`). Root `hugo.*` names beat legacy `config.*` (source:
  `config/configLoader.go` `DefaultConfigNames = ["hugo", "config"]`), and
  the `config/_default/` dir merges *over* the root file per key rather
  than falling back, which the probe approximates with first-found-wins.
- **`{{< ... >}}` is a parse error inside a partial**: shortcode invocation
  syntax can't appear literally in component template source — Hugo's
  template pass has no render-mode lexer there. Components must carry the
  call in data (a `body` prop run through `markdownify`, as the fixture's
  `custom-rich` does) so the render-mode lexer expands it at render time.
- **Data files need map roots**: a `data/*.yaml` whose root is a scalar
  (e.g. a bare logo string) looks fine but hard-errors the whole build at
  read time (`unexpected data type string`), taking the editor render down
  — data fixtures should stay map-shaped.
- **Init ordering in the renderer**: the dispatch layout + stub
  `<contentDir>/_index.md` must exist as files *before* `createSites()`
  (Hugo's first Running build only re-renders everything when they predate
  site creation). `loadConfig()` therefore runs *before* those writes and
  must not be moved after them.
- **Template string literals can't span physical lines**: Hugo's template
  parser (unlike Go's `text/template`) treats a newline inside a `"…"`
  as an unterminated string — the *whole site build* dies with a template
  **parse** error pointing at the action's first line. This bit us
  on 2026-08-12 when prettier reflowed the `errorf` message in
  `resources.html` across lines; it went undetected because the fixture
  bundles in use had been built *before* the reflow. The module partials
  are lint-excluded, so keep them out of formatter runs (or accept
  single-line strings and re-run fixture builds) — and remember **fixture
  bundles are gitignored, so `npm test` never rebuilds them**: a broken
  module source hides behind last-known-good bundles until a fresh
  `test:build-fixtures`.

## Open items, in suggested order

### 1. WASM distribution — DONE (2026-08-12)

`hugo_renderer.wasm.gz` is gitignored → **not in the module zip** → a site
importing the module from GitHub previously hit the `errorf` in
`editable-regions/resources.html`. Resolved as:

- **Release**: `release.yml`'s `upload-renderer-wasm` job builds the WASM
  (Go + `build.sh`, deterministic `gzip -n`) and attaches
  `hugo_renderer.wasm.gz` to the `v*` GitHub release.
- **Pinning**: no stamping — the module reads its own resolved version from
  the consumer's module graph via **`hugo.Deps`** (`eq .Path
  "github.com/cloudcannon/editables"` → `.Version`, available since Hugo
  v0.92). Release tags are `vX.Y.Z`; Go reports the leading `v` and, at
  v2+ (no root go.mod), `+incompatible` — both trimmed before URL use.
  `strings.TrimSuffix/TrimPrefix` take `(affix, string)`, unlike Go's stdlib.
- **Load**: `editable-regions/wasm-url.html` (partialCached) fetches the
  pinned asset with `resources.GetRemote` at consumer build time, publishes
  it under `public/_cloudcannon/`, fingerprints, and the runtime loads it
  same-origin (no CORS). Cached per version by Hugo's remote-resource cache.
- **Overrides**: `params.editable_regions.wasm_url` (full URL) and
  `_version` (version override, wins over `hugo.Deps` — for themes-dir
  consumers / private mirrors), plus `wasm_base_url`.
- **Fallbacks**: an explicit `_version = "0.0.0-dev"` or an empty resolved
  version (local replace/themes copy) falls through to the locally built
  module asset; commit-pinned consumers (pseudo-versions — no release asset
  exists) get an actionable `errorf`.
- Gotchas hit: `resources.GetRemote` fails to resolve a media type for
  `.wasm.gz`/octet-stream bodies (no `gz` type in Hugo's registry, and no
  mediaType option) — that's fine, the module only needs to *publish* the
  bytes; `GetRemote` returns nil on 404 (guard before `resources.Copy`);
  `resources.Copy` takes `(target, resource)` and a partial may only
  `return` a value once (single trailing return, interim `$result`).
- (Rejected: committing the binary to the dev repo — ~20MB gz as of the
  Hugo 0.164.0 bump, up from ~16MB at 0.147.6; and the release-job-stamps-`_version`
  variant — tags are immutable, so it couldn't work without a pre-tag commit
  dance, which `hugo.Deps` made unnecessary.)

### 2. Content loading — the big one (design settled session 2)

Goal: components that touch collections (`.Site.RegularPages`,
`site.GetPage`, etc.) render real data in the editor, without paying a
full-content load for sites/components that never use them.

Settled design:

- **Boot stays as-is**: template/data/config snapshot, stub
  `content/_index.md`. No content files at boot.
- **Content listing comes from the CloudCannon API at runtime** — no
  build-time page map (see removal task, item 5). No batch-fetch API
  exists today; callers should call freely and let the API internals
  optimise.
- **When content loads, fetch front matter only** and write stub content
  files with blank bodies via `writeHugoFiles` + change events. Bodies
  stay blank until a demonstrated need (no sentinel-body tricks yet).
- **Suppress full-site output with build options** (decision 11):
  `cascade: [{build: {render: "link"}}]` in `buildEditorConfig`;
  `renderHugoPartial` adds `build: {render: always}` to the dispatcher
  stub it already writes. Page store stays complete; only `index.html`
  is published.
- **Trigger is an open question**: the FS layer cannot detect "this
  partial uses collections" (absent `content/` → no reads → no signal).
  First pass: background warm after first render (edited file jumps the
  queue), or explicit/config-driven. Decide at implementation time.
- **Dependency-walk detection — researched, source-verified, but NOT
  first pass** (session 2). The precise long-term answer to the trigger
  question: Hugo's own dependency tracker records, per rendered page,
  exactly which pages it touched — reachable entirely through public
  API. Evidence chain (v0.164.0 source):
  - `tpl/tplimpl/template_funcs.go:140` (`trackDependencies`): every
    template method/func execution walks the receiver's identities into
    the current scope's dependency manager — `.Title` on a page records
    that page; partials chain their managers into the caller's
    (`tpl/partials/partials.go:260`), so deps flow up into the
    dispatcher page.
  - `hugolib/page.go:150`: `pageState` publicly satisfies
    `identity.DependencyManagerProvider`.
  - `identity.WalkIdentitiesDeep(page, cb)` (public) recursively walks
    the manager graph; page identities are their paths
    (`pageState.IdentifierBase()` = `Path()`, `page__meta.go:56`), which
    map directly onto the API content listing.
  - Recording is gated on `t.watching` (`template_funcs.go:117`), driven
    by the same Watch/Running flags the render hook already forces —
    tracking is already on in our builds.
  The loop: boot with blank skeleton files built from the (cheap) API
  listing → render → walk the dispatcher page's deps → fetch exactly the
  touched files → rebuild → re-walk to fixpoint (1–2 iterations). Empty
  dep set = component ignores content = zero content fetches. No
  sentinel values: skeletons carry structure only; the sensor is access,
  not output. Handle `identity.GenghisKhan` ("depends on everything") as
  a broad-fetch fallback.
  **Known hole**: value predicates evaluated inside Go (`where` on
  `.Params.*`, `if` on blank titles) record nothing and filter wrong
  against blank skeletons. Not fixable locally by any scheme; the real
  fix is a CloudCannon front-matter/batch API (real front matter in
  skeletons, only bodies lazy). Structural predicates (`Section`) and
  output-position value access are fine.
  First verification spike when resumed: render the test-site dispatcher
  and print the walked identity set (~20 lines in `renderer/main.go`).
- **Open idea, superseded**: a fault-and-settle afero wrapper (log reads
  of absent paths → JS fetches → rebuild). The probe showed walked trees
  give no useful FS-level signal, and the dependency walk above is the
  better sensor. Would only remain relevant for `assets/`/`i18n/`/
  `static/` laziness, which the snapshot mostly covers.

### 3. Render hook — descoped (was "idea 3")

The per-render incremental build (rewrite `content/_index.md` → fake
fsnotify event → `Sites.Build` → read `public/index.html`) **stays**.
The direct-template-execution seam was rejected: it sits below
`hugolib`'s public API (`tplimpl` territory) and the maintenance
coupling isn't worth the latency win.

**Params coercion — RESOLVED (2026-08-12)** by a bundle-path probe
(`coercion-probe.html` + `test/unit/hugo/params-coercion.test.ts`) and a
renderer fix. Findings:

- **Keys & dates were never broken**: camelCase/nested keys survive front
  matter exactly (`index` is case-insensitive; dotted access matches the
  original key), and date-looking strings stay strings.
- **Numbers were broken**: JSON front matter decodes every number as
  float64, so whole numbers took float type in the editor — `printf "%d"`
  errored and large ids (e.g. 9999999999) rendered `9.999999999e+09`.
- **Fix**: the renderer now writes the stub page's front matter as **YAML
  (goccy/go-yaml v1.19.2 — the same library Hugo's decoder uses) instead of
  JSON**, after recursively canonicalizing integral float64 values to int64
  (`integralizeNumbers`; goccy quotes ambiguous strings like `2024-01-15`,
  so date-looking strings stay strings). Props now arrive as int64/uint64,
  float64, bool, and string exactly as a real YAML-front-matter build gives
  them. Note goccy parses positive ints as uint64 (`printf "%d"` renders
  them fine either way).
- The handoff's earlier proposed fix (JSON-string props + `transform.Unmarshal`
  in the layout) would NOT have helped — `transform.Unmarshal` uses the same
  float64 JSON decode. Verbose-upstream note: props travel as YAML literals
  now, so keep `%T`-based type instructions out of component guidance.

### 4. wasip1 instead of GOOS=js — researched, deferred (was "idea 2")

Session 2 evidence:

- **Vanilla Hugo CLI does not compile to wasip1**: `bep/mclib` (mkcert,
  pulled in by `hugo server --tls`) has no wasip1 backend, and the
  server/livereload deps have no build-tag escape hatch. "No custom Go
  entrypoint" would mean carrying patches — strictly worse than our
  ~290-line `main.go`, which survived the 0.147.6→0.164.0 bump
  unchanged.
- **WASI has no file-change notifications**: `poll_oneoff` subscriptions
  are clock + fd readability only, so `hugo --watch` can't exist there —
  vanilla CLI means full-build-per-render, the exact regression we
  wanted to avoid.
- **No lazy fetch inside a syscall**: EAGAIN/`poll_oneoff` parks the Go
  goroutine while the JS main thread (suspended inside the WASM call)
  can never resolve the fetch — deadlock. `Atomics.wait` is banned on
  the main thread; Go doesn't support JSPI; Worker + SharedArrayBuffer
  needs `crossOriginIsolated` response headers we can't impose on
  customer sites.
- **FS-in-JS buys nothing over `writeHugoFiles`**: the afero memfs is
  Hugo's own required interface (not a GOOS=js workaround), and any live
  data must be pushed before a build regardless (sync/async wall), so
  routing logic lives at sync time either way.

Remains a valid glue swap if `wasm_exec.js` maintenance ever actually
hurts: wasmexport reactor model (Go 1.24+) + vendored
`browser_wasi_shim`. Would also fix the startup-readiness poll (item 5).

### 5. Smaller items

- **Done (2026-08-12): page map removed** (decision 12) — `page-map.html`,
  its use in `resources.html`, the `window.cc_hugo_pages` emission, and
  `runtimeData.pages` in `browser/index.mjs`.
- **Done (2026-08-12): `editable-regions/component.html` removed**; the
  annotation is documented wrapper markup in the README.
- WASM startup readiness is a `setTimeout(10ms)` poll for
  `globalThis.renderHugoPartial` — the Go side could signal readiness
  explicitly.
- `walk-dir.html` uses `merge` in a loop (O(n²)) — fine at partial scale.
- `hugo-integration-shape.md` describes the superseded output-format plan;
  keep as historical record or refresh.
- **Done (2026-08-12): `browser/index.mjs`'s `wasmUrl` fallback** comment
  refreshed for the build-time `_cloudcannon/` asset (item 1). The fallback
  itself remains as a boot-outside-the-bundle safety net.
- **Done (2026-08-12): `hugo.IsServer` now true in the editor.** `hugo.*`
  reads Running/Watch from the **per-language configs**, not the root —
  the renderer set only `cfg.Base.Internal.Running`, so `hugo.IsServer`
  was silently `false` (README's guidance to guard editor branches with
  it didn't work). Fixed in `renderer/loadConfig` by propagating the
  flags across `cfg.LanguageConfigMap`. Found while verifying the new
  globals suite.
- **Done (2026-08-12): globals test suite** (`test/unit/hugo/globals.test.ts`,
  bundle-path as requested) — the `globals-*.html` probe partials, the
  `data/` files, and the config surface (title, `languageCode`, extra
  params, two menus) live in the fixture site, and the tests render them
  through the built live-editing bundle (`loadHugoBundle`), covering the
  `site.*` and `hugo.*` surfaces, `site.Data`/`hugo.Data` + query helpers,
  page collections and `site.GetPage` over the stub editor site, language
  identity, and `site` staying in scope in nested partials. Also: the
  emitter's `locale` config key is a real Hugo key
  (`langs.LanguageConfig.Locale`) — verified `site.Language.Locale`
  resolves through it end-to-end. The WASM-boot harness extracted to
  `test/unit/_helpers/wasm-renderer.ts` remains the boot path for the
  direct-renderer `wasm-renderer.test.ts` (refactored onto it, zero
  behavior change). The slots "Bundled partials include" regex was
  loosened — the sorted list now interleaves the globals probes.
- **Done (2026-08-12): builtins battery** (`b43cccd` +
  `6d33972`) — `test/unit/hugo/builtins.test.ts` renders one `<div
  data-k>` row per builtin from `layouts/partials/builtins-probe.html`
  through the real WASM bundle; ground truth was captured against the
  native v0.164.0 binary (the same version the renderer bundles) with a
  scratch site. Findings baked into the probe conventions: **piped values
  land in the last positional slot** (vanilla text/template semantics — no
  per-function reordering in Hugo, so `X | where "k" "v"`, `X | sort
  "key"`, `X | replace "a" "b"`, `X | transform.Highlight "js"` etc. all
  mis-route the piped value; the probe uses direct-call form for every
  multi-arg builtin); `strings.Join` no longer exists (use
  `collections.Delimit`); `crypto.FNV32a` moved to the `hash` namespace;
  `strings.Count` is `(substr, s)`; `countrunes` excludes whitespace;
  `math.Div` on ints truncates (10/4 → 2); time-test inputs are date-only
  or explicit-UTC so results don't depend on the renderer timezone.
- **Done (2026-08-12): custom-directories suite** (decision 13) —
  `test/unit/_fixtures/hugo-custom-dirs` + `test/unit/hugo/custom-dirs.test.ts`
  (8 tests) built by `test:build-hugo-custom-dirs` (part of
  `test:build-fixtures`); the fixture's `templates/_default/index.html`
  proves kind layouts are excluded by default, and a map-rooted data file
  under `custom-data/` proves `hugo.Data` resolves from the configured
  data dir.
