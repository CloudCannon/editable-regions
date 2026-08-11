# Hugo integration: handoff (2026-08-11)

State of `feat/hugo-editable-regions` after a review/rework session. The
original design doc (`hugo-integration-shape.md`) predates this — where they
disagree, this document wins.

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
is already lazy + remote-capable. (Rejected: committing the 16MB binary to
the dev repo.)

### 2. Render hook re-evaluation (idea 3) — the big one

Current hook: per render, rewrite `content/_index.md` front matter with
`cc_partial`/`cc_props` → fake fsnotify event → incremental `Sites.Build`
(with `Running`/`Watch` flags forced) → read `public/index.html`. Uses only
public `hugolib` API, but:

- **Props round-trip through front matter → `.Params` coercion.** Hugo
  lowercases param keys and mangles types (dates→strings, numbers→float64).
  UNVERIFIED for our exact path — write a test with camelCase keys, dates,
  and nested maps first to confirm severity.
- The rebuild machinery (fake fsnotify, Running/Watch, counting publish FS)
  exists *only* to re-execute a template with new props.

Key insight: the snapshot is immutable during an editing session; props are
the only per-render variable. Proposed hook: **build once at init, then
execute the already-compiled partial template directly with props as the
context** — kills the fsnotify theater and the coercion problem in one move,
and render latency drops to pure template execution. Risk: executing a named
   template sits below `hugolib`'s public API (`tplimpl` territory) — spike it
   against the pinned v0.164.0 in the module cache
   (`~/go/pkg/mod/github.com/gohugoio/hugo@v0.164.0`; look for a
   `Site.Tmpl()`/template-lookup seam reachable from `hugolib.HugoSites`).
The Go module cache trick from this session — reading Hugo's source there —
was repeatedly effective.

Cheap fallback if the seam is ugly: keep per-render Build, but pass props as
a JSON *string* param and `transform.Unmarshal` it in the editor layout —
fixes coercion with a five-line change.

### 3. wasip1 instead of GOOS=js (idea 2)

Honest framing: this is a **glue-layer upgrade, not an internals fix** — the
fsnotify/Watch fakery is target-independent (item 2 is where that lives).
What wasip1 buys:

- Deletes `wasm_exec.js` (578 vendored lines that must exactly match the Go
  toolchain version — real maintenance hazard).
- Standard runtime: the binary runs under wasmtime/Node WASI —
  `verify-renderer.mjs` gets simpler and portable.
- go.mod is already on Go 1.24, which added `//go:wasmexport` for wasip1 —
  keep the current request/response call model (`renderHugoPartial` as an
  exported function); do NOT take on a blocking stdio process loop.

Cost: a browser WASI host shim (`@bjorn3/browser_wasi_shim` or similar) —
vendor it into module assets so `js.Build` bundles it without depending on
the site's node_modules. Sequencing: if item 2 changes the Go-side
interface, do it first so the wasmexport surface is built once.

### 4. Dead page map

`window.cc_hugo_pages` is emitted and stored in `runtimeData.pages` but
nothing consumes it. Either wire it up (the design doc intended it to back
permalink/`ref`/`GetPage`-style lookups) or delete the emission.

### 5. Smaller items

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
