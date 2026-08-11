# Hugo integration: handoff (2026-08-11)

State of `feat/hugo-editable-regions` after a review/rework session. The
original design doc (`hugo-integration-shape.md`) predates this — where they
disagree, this document wins.

Updated same day after a follow-up design session: decisions 8–12 added
(GOOS=js settled, content-loading design, page-map removal); the open
items were rewritten to match. Items 2–4 below supersede their earlier
versions entirely.

## Current shape (committed)

- `8ce7a77` — teammate's initial working version (Go WASM renderer, output
  format emission).
- `59ed84b` — emission moved to Hugo Pipes: single fingerprinted bundle,
  `[outputs]` requirement deleted, WASM fingerprinted.
- `7a9b8e6` — runtime bundles **from source** via `js.Build` at site build
  time; the repo root is the module.

Architecture in one paragraph: the consuming site adds
`[[module.imports]] path = "github.com/cloudcannon/editables"` and
`{{ partial "editable-regions" . }}` in its `<head>`. The repo-root
`hugo.toml` mounts `hugo-module/{layouts,assets}`, `integrations/hugo/browser`,
and `helpers/` into the virtual FS (at repo-relative paths, so import
specifiers inside the sources resolve identically when mounted).
`editable-regions/resources.html` builds a snapshot context (walk-files,
site-config, page-map partials + fingerprinted WASM URL), renders the entry
asset `browser/entry.js` with it via `resources.ExecuteAsTemplate`, bundles
with `js.Build` (minify off under `hugo.IsDevelopment`), fingerprints, and
`editable-regions.html` emits the single `<script>` (SRI + defer). In the
browser the runtime boots real Hugo (GOOS=js WASM, hugolib over afero memfs)
lazily once the CloudCannon API appears; each component render rewrites
`content/_index.md` and runs an incremental build.

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
   `editable-regions/component.html` (annotation), internals under
   `editable-regions/` (resources, walk-*, site-config, page-map).
   `cc/` namespace deleted.
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
  reason. With a local replacement, no Go toolchain or network is needed to
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

## Open items, in suggested order

### 1. WASM distribution — BLOCKER for real users

`hugo_renderer.wasm.gz` is gitignored → **not in the module zip** → a site
importing the module from GitHub hits the `errorf` in
`editable-regions/resources.html`. Only the fixture works today (local
replacement sees the locally built file).

Agreed direction: `release.yml` (already triggers on `v*`) attaches
`hugo_renderer.wasm.gz` as a GitHub release asset; the module's default
`wasm_url` points at the version-pinned release URL. The module needs to
know its own version for that URL — add e.g. a `params.editable_regions._version`
placeholder in the module config that the release job stamps. Runtime fetch
is already lazy + remote-capable. (Rejected: committing the binary to the
dev repo — ~20MB gz as of the Hugo 0.164.0 bump, up from ~16MB at
0.147.6.)

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
  Candidates: background warm after first render (edited file jumps the
  queue), or explicit/config-driven. Decide at implementation time.
- **Open idea, not adopted**: a fault-and-settle afero wrapper (log reads
  of absent paths → JS fetches → rebuild). A generic answer for
  `assets/`, `i18n/`, `static/`, which the snapshot doesn't cover.
  Deferred until the loading work shows whether it's needed.

### 3. Render hook — descoped (was "idea 3")

The per-render incremental build (rewrite `content/_index.md` → fake
fsnotify event → `Sites.Build` → read `public/index.html`) **stays**.
The direct-template-execution seam was rejected: it sits below
`hugolib`'s public API (`tplimpl` territory) and the maintenance
coupling isn't worth the latency win.

Still open: the `.Params` coercion question (camelCase keys lowercased,
dates→strings, numbers→float64) remains UNVERIFIED for our exact path —
write the test with camelCase keys, dates, and nested maps. If it bites,
the fix is the JSON-string props param + `transform.Unmarshal` in the
editor layout (five lines, public API).

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

- **Delete the page map** (decision 12): `page-map.html` partial, its use
  in `resources.html`, the `window.cc_hugo_pages` emission, and
  `runtimeData.pages` in `browser/index.mjs`.
- WASM startup readiness is a `setTimeout(10ms)` poll for
  `globalThis.renderHugoPartial` — the Go side could signal readiness
  explicitly.
- `editable-regions/component.html` hardcodes a `<div>` wrapper — consider
  making the element/attributes configurable.
- `walk-dir.html` uses `merge` in a loop (O(n²)) — fine at partial scale.
- `hugo-integration-shape.md` describes the superseded output-format plan;
  keep as historical record or refresh.
- `browser/index.mjs`'s default `wasmUrl` fallback
  (`/cc-editable-regions/hugo_renderer.wasm.gz`) is from the static-file era
  — re-evaluate once item 1 lands.

## Environment notes

- Hugo 0.164.0 (extended) + Go 1.26.5 were installed to
  `/tmp/opencode/toolchain` this session (ephemeral — reinstall if gone).
  The renderer pins hugo v0.164.0, which requires Go >= 1.26; the vendored
  `wasm_exec.js` must match the Go toolchain (`$(go env GOROOT)/lib/wasm`).
- Verify loop: `npm run build:hugo` (root; WASM only), then
  `npm run build` in `test/integrations/hugo` (chains build:hugo, Hugo,
  verify-bundle.mjs — 21 checks incl. booting the real WASM in Node and
  asserting editor render == build-time render). `node
  integrations/hugo/renderer/verify-renderer.mjs` smoke-tests the renderer.
- The verifier executes the real bundle in a `vm` sandbox with stubbed
  browser globals (`window` aliased to the sandbox global; `document.addEventListener`,
  `crypto`, `performance`, `TextEncoder/Decoder`) — extend the stubs if the
  runtime's startup side effects grow.
