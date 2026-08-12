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

Updated 2026-08-12 (evening) with the content-loading first pass landing
(item 2 below adjusted accordingly): front matter for all content files
loads at boot, the renderer renders *through the current page*, and the
cascade build suppression (decision 11) is in. This session also wrote
`current-page.test.ts` and discovered a hard renderer constraint
(`os.*` template funcs see no files in the WASM).

Updated 2026-08-12 (late) with the mid-session content-freshness pass (a
gap vs. the Liquid/Eleventy runtime): CloudCannon's site-wide `change`/
`delete` events now update content stubs live. The runtime subscribes after
boot, filters to content files (content dir + content extensions), re-fetches
the changed file's front matter, rewrites its stub, and runs a build-only
rebuild via a new `rebuildHugoEditorSite` renderer export — so the dispatch
page stays alone in its own (render) build and the single-content-write
invariant holds. New files are loaded by the same write-then-rebuild path
(probe-verified in the WASM — the earlier "adds via fake events are not
guaranteed to load" note predates this mechanism); deleted files drop from
the store unless they're a publish opt-in (home or the session target), which
are kept so the render chain doesn't break. Covered by
`test/unit/hugo/content-freshness.test.ts` (7 tests) using new mock site-wide
event emitters (`emitMockApiChange`/`emitMockApiDelete`). See item 2.

Updated 2026-08-12 (late) with the template-capture widening: the snapshot now
includes **theme and vendored-module templates** (partials, render hooks,
shortcodes). Themes are discovered from `hugo.Deps` (an entry whose physical
`themesDir/<Path>` exists), vendored modules from `hugo.Deps` entries with
`Vendor=true` (`_vendor/<Path>`); module configs are probed for
`module.mounts` so mount-remapped trees capture under their logical targets,
and layers merge first-wins keyed by logical path with the project walking
merged last (project wins), matching Hugo lookup priority. Kind layouts stay
excluded (the dispatch-layout shadowing rule). Content and data remain **not**
captured — content still loads from the CloudCannon API at runtime with live
refresh; data still walks physical `dataDir` only (theme data files stay
absent; see the "not captured" notes). Along the way this surfaced and fixed
a latent `layout-dirs.html` bug: the `os.*` template funcs read Hugo's UNION
filesystem, where an imported module's root `hugo.toml` (ours included) shows
up at the union path "hugo.toml" — so config.toml users' dir probe was reading
the module's config (defaults by luck). The probe now skips module-fingerprint
configs (only `[module]` mounts). Covered by
`test/unit/hugo/module-templates.test.ts` (6 tests, fixture gains a `proot`
theme + a hand-vendored `example.com/cc-fixture-vendor` module in `_vendor/`).
See the gotchas and item 2's notes.

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
- *(next commit)* — **content loading + cascade + current-page rendering**
  (this session): the runtime loads every content file's front matter at
  boot and writes front-matter stubs (blank bodies), opting the home page
  and the boot-time current page into publishing (`build.render: always`)
  under the config's `cascade: build.render: "link"`; init seeds an empty
  headless `cc-dispatch` page; each render rewrites only that dispatch page
  (partial + props) and reads the current page's output — the current page
  re-renders through its dependency on the dispatch page. Components get
  real page data via `site.*` collections/*GetPage* and the current page
  via the `page` global. See item 2.
- *(then)* — **mid-session content freshness** (`cb9a286`): CloudCannon's
  site-wide change/delete events rewrite content stubs live (see item 2's
  freshness notes).
- *(then)* — **theme + vendored-module template capture** (2026-08-12 late):
  the snapshot walks `themes/*` and `_vendor/*` (from `hugo.Deps`), mount-
  aware per module, project-wins on clash; content/data from those layers
  stay uncaptured. Also fixed the latent `os.*`-union config-probe bug in
  `layout-dirs.html`. See item 2's capture notes.

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
lazily once the CloudCannon API appears; the runtime then loads every
content file's front matter as stubs (dirs resolved from the site config,
decision 13; defaults `layouts`/`data`/`content`), opting the home page and
the boot-time current page into publishing under the config's
`cascade: build.render: "link"`, and each component render rewrites only the
headless `cc-dispatch` request page and runs an incremental build — the
current page re-renders through its dependency on it, so components see the
current page via the `page` global.

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
    stay unloaded until a demonstrated need appears. **Landed 2026-08-12
    as "all front matter at boot"** (the user's chosen first pass; the
    phased/dependency-walk refinement is item 2).
11. **Full-site rendering is suppressed with build options, not
    `disableKinds`** (session 2, probe-verified on v0.164.0): editor
    config gets `cascade: [{build: {render: "link"}}]`; the home stub and
    the boot-time current page opt in with `build: {render: always}` —
    the only two pages that ever publish. Pages stay in the store
    (collections, `.Content`/`.Summary`, and permalinks all work —
    `render: "never"` would empty `.RelPermalink`) while only the opted-in
    pages publish. **Landed 2026-08-12**.
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
      root; revisit only if a consumer hits it. **Module-config guard**
      (2026-08-12 late): candidates that are a module's own config (only
      `[module]` with mounts) are skipped so the probe falls through to the
      project's real file — see the union-fs gotcha below.
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

- **`os.*` template funcs see NO files in the WASM renderer** (2026-08-12,
  probe-verified): `os.ReadFile`/`os.FileExists` return empty/false for
  everything — including `config.json` and `content/_index.md` — because the
  os namespace reads `BaseFs.Work`/`BaseFs.Content`, which are not backed by
  the renderer's memfs. This killed the planned `cc_request.yaml` +
  `os.ReadFile` dispatch (decision 13's config-file probe never exercised
  this path inside the WASM — the dirs travel in the snapshot instead). The
  **headless dispatch page** (`contentDir/cc-dispatch`, read via
  `site.GetPage` from the dispatch layout) is the WASM-safe request channel:
  normal front-matter path, no template fs access, and headless pages are
  excluded from `site.Pages`/`AllPages`/`RegularPages`, emit no output, yet
  resolve via `site.GetPage` (verified natively + in the WASM).
- **Natively, the `os.*` template funcs read Hugo's UNION filesystem — and
  its directory listings do NOT merge theme/mount layers** (2026-08-12 late,
  probe-verified on v0.164.0): `readDir "layouts/partials"` lists only the
  project layer's entries (theme partials absent), while `readFile`/
  `fileExists` on the *same* path DO resolve theme files (the overlay falls
  through layers for known paths), and physical theme paths (`readDir
  "themes/<name>/layouts/partials"`) enumerate fine. Consequence: the old
  walker missed themes only because it relied on logical-path `readDir` — not
  because theme files are unreadable. The capture now walks `themes/*` and
  `_vendor/*` physically and remaps to logical keys (see item 2). Second
  consequence: the UNION means an imported module's root `hugo.toml` appears
  at the union path "hugo.toml" — so `layout-dirs.html`'s config probe was
  silently reading the MODULE's config for sites whose own config is
  `config.toml` (an editables import is sufficient to trigger it; defaults
  masked it). The probe now skips candidates whose parsed content lacks a
  site-level key (module-fingerprint configs are just `[module]` + mounts).
- **Multi-content-change builds skip newly-opted pages** (2026-08-12,
  repro'd in the WASM): a build whose change set contains **≥2 user content
  writes** silently fails to render a page whose `build.render` was just
  flipped to `always` — no error, no output, while already-published pages
  still re-render via their dispatch dependency. Single-write-per-render
  builds (the current design: one dispatch write) are rock solid (the
  20-render burst stays fresh). This quirk is why per-render page writes
  (opt-ins/restores) were graduated to boot time. Root cause in Hugo's
  partial-rebuild rendering gates is not yet understood; don't batch content
  writes per render until it is. This is also why the mid-session freshness
  listener (item 2) rebuilds *immediately* after each stub write: the bare
  rebuild keeps that write its own single-write change set, so the dispatch
  write never shares a build with a content write.
- **No multi-line string literal exists in Hugo templates** (2026-08-12,
  probe-verified): a raw newline inside `"…"` is a parse error
  ("unterminated quoted string"), and backtick raw strings (a Go *language*
  feature) don't exist in template syntax either. Escaped `"\n"` in a
  literal IS unquoted at render time (multi-line values are representable
  as escapes), and `{{ $x := partial … }}` captures rendered multi-line
  output into a variable — but `template`/`block` invocations are not
  assignable. Consequences: generated-template prop embedding is possible
  but requires per-value escaping (quotes, backslashes, control chars,
  `{{`/`}}`) — strictly worse than the front-matter channel, which is why
  the dispatch page carries props.
- **A layout write alone re-renders already-published pages**: the
  "template changed" path re-renders every page that has rendered before,
  with no content write (verified in the WASM). It cannot bring a
  never-rendered page alive (its `build.render` opt-in requires a front
  matter re-read). The current design doesn't need it — the dispatch
  dependency re-renders — but it's a lever for future optimizations.
- **`disableKinds` behaves differently between the WASM renderer and the
  native CLI** (2026-08-12, probed natively + in the WASM): with identical
  config (cascade + `disableKinds` removing taxonomy/term/RSS/sitemap/404),
  `site.Pages` excludes the auto-built taxonomy/term pages in the WASM (5
  content pages) but the native CLI keeps them (10). Likely the difference
  between the renderer's event-driven rebuild assembly and a fresh build;
  nothing depends on it, and the collection tests assert content-kind counts
  only (home/section/page are identical in both).
- **Under the render-link cascade, a page's list surfaces only its direct
  children** (2026-08-12, probed): `site.Home.Pages`/`.RegularPages` return
  the home's direct children only (the blog section + about); one/two,
  nested under the blog (link) section, don't bubble up into home's
  aggregate. The section's own `.Pages`/`.RegularPages` (2) still include
  them, and global `site.RegularPages` (3) includes everything. Same numbers
  natively and in the WASM.
- **Home page `.Date` defaults to the site's latest content date**: a home
  stub without an explicit `date` gets the newest page's date (Hugo's
  aggregate behavior). Give fixture/mock home files an explicit `date` so
  date-based assertions are deterministic.
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

### 2. Content loading — FIRST PASS LANDED (2026-08-12 evening)

Goal (unchanged): components that touch collections (`site.GetPage`, page
ranges, current-page data) render real data in the editor. The first pass
loads **all** content front matter at boot (per the user's call to keep it
simple), leaving bodies blank. The dependency-walk design below remains the
refinement path, now unblocked by the content that exists.

What landed:

- **Content load at boot** (`browser/index.mjs` `loadEditorContent`): after
  the snapshot write and before `initHugoEditorSite`, the runtime lists
  files via `CloudCannon.files()`, filters to the content dir + content
  extensions, fetches each file's front matter (`file.data.get()`), and
  writes stubs (front matter, blank body) through `writeHugoFiles`. Files
  land **before** site creation, so no incremental content-add path is
  involved (read-trace: adds via fake events are not guaranteed to load).
  Pages are slugified per-segment from their file names (a JS
  approximation of Hugo's `urlize`; exotic filenames may diverge).
- **Stub format is YAML** (`browser/serialize-yaml.mjs`, ~120 lines, no
  dependency so the module keeps bundling from consumer `node_modules`):
  every string double-quoted, 2-space indent. JSON stubs would turn every
  whole number into float64 in `.Params` (the params-coercion lesson);
  YAML keeps ints ints (`printf "%d"` works) and Hugo parses date strings
  into real `time.Time` (verified via the renderer). The home stub always
  carries `build: {render: always}`.
- **Cascade suppression landed** (decision 11): `buildEditorConfig` emits
  `cascade: {build: {render: "link"}}`. Pages stay in the store with working
  `.RelPermalink`/`.Content`; only pages opted in with `build.render: always`
  publish — exactly two: the home page and the current edit target.
- **The current page is fixed at boot** (per the user, 2026-08-12 evening):
  navigating to another page reboots the editor (fresh page load), so the
  target never changes mid session. `loadEditorContent` captures
  `CloudCannon.currentFile()` **once** and opts that page's stub into
  publishing alongside home; with no current file the target is home. The
  render request therefore only needs `partial` + `props` — the `pageFile`
  mechanism and all per-render page writes are GONE.
- **The dispatch page — now static, seeded at init** (the os\* constraint
  below forced this channel). `initHugoEditorSite` writes an EMPTY
  `<contentDir>/cc-dispatch/index.md` (`headless: true`, `cc_partial: ""`)
  before the first build. Every opted-in page's layout executes
  `site.GetPage "/cc-dispatch/"`, so that first render records the dispatch
  page as a **dependency** of home and the current page. Each render then
  writes ONLY this one file with the real request (`cc_partial`/`cc_props`
  via goccy YAML, integralized — the same typed props path as ever) — the
  current page re-renders through the dependency chain. Headless pages are
  invisible to `site.Pages`/`AllPages`/`RegularPages`, produce no output,
  but resolve via `site.GetPage` (verified natively). The dispatch layout
  `{{ with site.GetPage "/cc-dispatch/" }}{{ if .Params.cc_partial }}{{ partial .Params.cc_partial .Params.cc_props }}{{ end }}{{ end }}`
  runs on every rendered page (all.html is the last-resort layout for every
  kind), so the target's output carries the component HTML with `page`
  bound to the target. **One content write per render** — immune to the
  multi-event quirk below.
- **Props typing preserved**: props travel through goccy YAML front matter
  on the dispatch page and are read back as `.Params.cc_props` — same typed
  round-trip as the old stub front matter. `integralizeNumbers` unchanged.
  `renderHugoPartial` keeps only the dispatch write + build + output read.
- **Layout change = re-render trigger** (verified 2026-08-12 evening):
  writing `layouts/all.html` alone re-rendered an already-published page with
  no stub write (the "template changed" path). Not used — the dispatch
  dependency already re-renders — but a useful lever for future
  optimizations (e.g. a bare-request steady state). It does NOT bring a
  never-rendered page alive (its `build.render` opt-in needs a file re-read)
  and props can't ride in generated template code (no multi-line literal in
  Hugo templates; `"\n"` escapes work but per-value escaping + template
  injection make it strictly worse than the front-matter channel).
- **Mid-session freshness LANDED** (2026-08-12 late) — closing the gap
  where the editor site served boot-time data after boot (the Liquid runtime
  refreshes from the API per render; the Hugo runtime previously didn't).
  `watchContentChanges()` subscribes to CloudCannon's site-wide
  `change`/`delete` events (one listener each; `event.detail.sourcePath` is
  the changed file) and keeps content stubs live:
  - **Change** → `updateContentStub`: filter to content files (content dir +
    `CONTENT_EXTENSIONS`), re-fetch `CloudCannon.file(path).data.get()`,
    rewrite the stub via `writeHugoFiles` (re-applying the home/session
    opt-ins through the shared `stubContents` so `build.render: always`
    survives the rewrite), then a build-only
    **`rebuildHugoEditorSite`** (new renderer export — `builder.build()`
    with no dispatch write).
  - **Why build immediately**: the render build must stay single-write. If
    the stub write rode along to the next `renderHugoPartial`, the change set
    would batch stub + dispatch — exactly what the multi-content-change quirk
    forbids. A bare rebuild per update keeps every build at one content write.
  - **New files** are loaded by the same write-then-rebuild path — verified
    in the WASM with a real `js.Build`/hugolib incremental rebuild. The
    handoff's older "adds via fake events are not guaranteed to load" note
    (from the boot-loading session) does not apply here.
  - **Delete** → `removeContentStub`: drops the page from the maps,
    `removeHugoFiles`, rebuild. The home page and the session target are kept
    (they're the publish opt-ins the render chain reads; deleting the target
    is a page the editor is tearing down anyway).
  - **Not tracked**: files outside the content dir (templates, data, static)
    — events for them are ignored, no rebuild.
  - **Tests**: `test/unit/hugo/content-freshness.test.ts` (7 bundle-path
    tests, `vi.waitFor` against the real WASM): current-page edit → `page`
    (and the stub's opt-in survives — the render only succeeds if it does);
    another page's edit → `site.Pages`; home edit → `site.Home.Params`; a
    brand-new file appearing; non-content events ignored; delete dropping a
    page from collections; delete of the session target keeping its stub.
    The mock gained site-wide listeners + `emitMockApiChange`/
    `emitMockApiDelete` (a synchronous dispatch; async handlers resolve on
    later microtasks, hence the polling assertions).
- **Test suite**: `test/unit/hugo/collections.test.ts` (boot with a mocked
  current page: current-page context, the page tree + query surface
  (`collections-query.html`), steady-state freshness, and the "session
  target is fixed at boot" contract — later `setMockCurrentFile` changes do
  NOT switch pages) and `test/unit/hugo/home-page.test.ts` (no current file
  at boot → home fallback with real home data). Probes:
  `page-context.html`, `content-pages.html`, `collections-query.html`.

### Template capture from themes and vendored modules — LANDED (2026-08-12 late)

The snapshot now includes templates provided outside the project's own tree:

- **Themes** (`walk-modules.html`): discovered from `hugo.Deps` — an entry
  whose physical `themesDir/<Path>` directory exists is a theme (imports
  resolve from the go module graph/cache, not `themes/`, so the disk check
  is unambiguous and needs no config parsing). A vendored theme (dep
  `Vendor=true`) walks from `_vendor/<Path>` instead.
- **Vendored modules**: `hugo.Deps` entries with `Vendor=true` walk from
  `_vendor/<Path>` — the layout `hugo mod vendor` produces. **Non-vendored
  imports stay unreachable** (go module cache; templates can't resolve it) —
  `hugo mod vendor`, `template_dirs`, or a local copy remain the options.
- **Mount-aware per module** (`module-templates.html`): the module's own
  `hugo.{toml,yaml,yml,json}` is probed for `module.mounts`; mounts whose
  target is `layouts` or `layouts/{partials,_default/_markup,shortcodes}` map
  their physical source onto the logical target prefix (the site's
  `layoutDir`). No mounts → the module's default `layouts/` tree is walked.
- **Priority is first-wins per logical path**: themes in `hugo.Deps` order
  then vendored imports, and the project's own walk is merged LAST (merge's
  rightmost-arg-wins = project wins) — matching Hugo lookup priority. Kind
  layouts stay excluded everywhere (dispatch-layout shadowing rule).
- **`walk-dir.html` gained a `keyDir`**: physical module dirs are read while
  keys land under the logical prefix (e.g. read `themes/proot/layouts/
  partials/x.html`, key `layouts/partials/x.html`).
- **Not captured (deliberately, per the user's call)**: **content and data
  from themes/modules**. Content stays CloudCannon-API-driven (live refresh,
  and theme-shipped content files aren't real CC files); data still walks
  the physical `dataDir` only, so `site.Data` file entries from theme data
  dirs stay absent in the editor. Also not captured: non-vendored import
  trees (above) and project-level `module.mounts` not listed in
  `template_dirs`. See the `os.*` union-fs gotcha for the mechanics that
  makes theme capture possible (physical-path reads) and the latent
  `layout-dirs` config-probe bug this surfaced (fixed with the
  module-config guard).
- **Tests**: `test/unit/hugo/module-templates.test.ts` (6 bundle-path
  tests). Fixture gained `theme = "proot"` (`themes/proot/`: partials incl. a
  `dupe.html` name clash, `_default/_markup/render-link.html`, and a
  shortcode) + a hand-vendored `example.com/cc-fixture-vendor` in `_vendor/`
  (modules.txt present => Hugo auto-vendors; no go toolchain needed in the
  fixture build). Coverage: theme partial renders, cross-tree nested
  includes, project-shadows-theme dedup, theme shortcode + render hook
  inside component `markdownify`, vendored partial renders.

Deferred / next:

- **Mirror the site's configured taxonomies into the editor site** (design
  settled 2026-08-12, not landed). Components touching taxonomies — tag
  clouds (`range site.Taxonomies`), category sidebars, `site.GetPage
  "/tags/hugo/"` term listings — currently render wrong/empty in the editor
  because the WASM builds Hugo's **default** dimensions (tags + categories)
  and trims taxonomy/term pages from the store. Plan:
  - **Source of the config**: templates can't read the taxonomies config —
    `site.Config.Taxonomies` doesn't exist on v0.164.0 (probe:
    "can't evaluate field Taxonomies in type page.SiteConfig"); the populated
    `site.Taxonomies` is reachable but can't reveal EMPTY configured
    dimensions. So extract `taxonomies` from the site's own config
    file(s) with the exact `os.ReadFile` + `transform.Unmarshal` probe
    pattern `layout-dirs.html` already uses for layoutDir/dataDir/contentDir
    (runs on the consumer's native build, where os.ReadFile works).
  - **Forwarding**: carry it in the snapshot (`site-config.html`) and in
    `buildEditorConfig`, so the editor config declares the site's actual
    dimensions (including custom ones like `author`).
  - **Stop disabling the kinds**: remove "taxonomy"/"term" from
    `DISABLED_KINDS` in `browser/index.mjs` — keeping them disabled is what
    makes the WASM drop those pages from `site.Pages` (the disableKinds
    native-vs-WASM divergence gotcha). The cascade (`render: "link"`)
    already suppresses their output, so keeping them in the store costs
    only a small assembly pass (one page per distinct tag value in the
    loaded front matter).
  - **Verify** in the WASM: `site.Taxonomies` matches production membership,
    term pages resolve via `site.GetPage`, term `.Pages` hold the real
    stubs, and no term/taxonomy output files are emitted under the cascade.
    Revisit the collections-query probe then (it deliberately avoids
    term/taxonomy rows while the kinds are disabled).
  - Caveat: terms are built from the LOADED stubs' front matter only
    (same front-matter-without-bodies boundary as everything else).
- **Dependency-walk loading (the big optimization) — still future.** Now
  that content is in the editor site, Hugo's dependency tracker can say
  which pages a component touched (research below) and drive a second phase:
  fetch front matter only for touched files, leaving the rest unloaded.
- **The home + current page keep their opt-ins until reboot** (the memfs is
  disposable and the session is fixed at boot, so nothing accumulates — no
  restore machinery needed). `build` remains visible in those pages'
  `.Params`; accepted and documented.
- **Exotic filenames**: the JS slugifier approximates Hugo's `urlize`;
  unicodé/spacey source paths may produce page paths that don't match
  Hugo's. Revisit if a consumer hits it.
- **Bodies remain blank** until a demonstrated need (decision 10).

- **Dependency-walk detection — researched, source-verified, but NOT
  implemented** (session 2). Hugo's own dependency tracker records, per
  rendered page, exactly which pages it touched — reachable through public
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
    by the same Watch/Running flags the render already forces — tracking
    is already on in our builds.
  - **Empirically confirmed this session**: the home page re-renders on
    dispatch-page changes through exactly this dependency chain (the
    dispatch write changes the page the layout reads), even when the home
    stub itself didn't change.
  The loop (if/when implemented): render → walk the target page's deps →
  fetch exactly the touched files → rebuild → re-walk to fixpoint.
  Handle `identity.GenghisKhan` ("depends on everything") as a
  broad-fetch fallback. **Known hole**: value predicates evaluated inside
  Go (`where` on `.Params.*`, `if` on blank titles) record nothing and
  filter wrong against blank skeletons. The real fix is a CloudCannon
  front-matter/batch API.
- **Open idea, superseded**: a fault-and-settle afero wrapper (log reads
  of absent paths → JS fetches → rebuild). The probe showed walked trees
  give no useful FS-level signal, and the dependency walk above is the
  better sensor.

### 3. Render hook — descoped (was "idea 3")

The per-render incremental build (write the current target's own stub +
the dispatch page → fake fsnotify events → `Sites.Build` → read
`public/<target>/index.html`) **stays**. The direct-template-execution
seam was rejected: it sits below `hugolib`'s public API (`tplimpl`
territory) and the maintenance coupling isn't worth the latency win.

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

### 6. Replace the config-file probe with a salient-folder template walk — DESIGNED (2026-08-12), not implemented

Supersedes the `layout-dirs.html` half of decision 13. Motivation: the
probe re-implements Hugo's config loader in a template and silently
misses real configurations — environment-specific config dirs
(`config/production/`, `config/development/`), per-key merging of
`config/_default/` over a root file, `HUGO_*` env overrides, the
`--config` flag, and union-fs shadowing (a *theme* shipping `params` in
its root `hugo.toml` passes the site-level fingerprint and the
first-found-wins `break` then skips the project's real file). The
replacement design agreed this session:

- **Primary discovery is a recursive walk of the project tree** looking
  for salient folder names (`partials`, `shortcodes`, `_default`,
  `_markup`). Candidate template name = path from the FIRST salient
  component onward (`templates/partials/card.html` →
  `partials/card.html`; nested `layouts/partials/nested/partials/x.html`
  still derives correctly). This makes discovery layoutDir-agnostic with
  no config parsing at all.
- **`templates.Exists` is the authoritative filter.** It queries the
  parsed template namespace (probe-verified, v0.164.0 native binary):
  true for partials (including mount-backed ones), shortcodes (incl.
  nested `shortcodes/foo/bar.html`), and render hooks
  (`_default/_markup/render-link.html`); names are namespace-relative
  and prefix-required. False positives like `content/blog/partials/x.md`
  fail the check and are skipped. The extension filter in
  `walk-files.html` (`.html`/`.htm`) can be dropped — Exists is the
  arbiter. Caveat: it is a POINT QUERY; stock Hugo has no template
  enumeration, so it filters/validates walk-derived candidates, it
  cannot generate them.
- **The capture filter stays prefix-based, not Exists-only**: only
  snapshot names starting `partials/`, `shortcodes/`, or
  `_default/_markup/`. Otherwise `_default/list.html`/`baseof.html`
  (kind layouts) pass Exists and get captured, violating the
  dispatch-layout shadowing rule (decision 13, tested).
- **Prune during the walk**: `themes/` + `_vendor/` (handled separately
  via `hugo.Deps`, unchanged), plus `.git`, `public`, `resources`,
  `node_modules`.
- **Fallback is a params-configured dir list** (e.g.
  `params.editableRegions.templateDirs`), and it must be ADDITIVE
  (walk ∪ configured dirs), not only-when-empty — the mount scenario is
  "walk finds the normal `layouts/` tree fine but silently misses
  `shared/`".
- **`dataDir`/`contentDir`**: likely not needed going forward; the probe
  can shrink to forwarding defaults. Revisit when content/data needs
  settle.

Probe-verified fs facts behind the design (v0.164.0 native binary,
scratch site with `source = "shared"` → `target = "layouts/partials"`):

- **`readDir` sees the physical project dir PRE-mount**: mount targets
  are invisible at their logical path (`readDir "layouts/partials"`
  lists only the physical entries; the mounted files absent), and
  `os.FileExists "layouts/partials/card.html"` is likewise false — the
  readFile fall-through documented in the gotchas is a THEME-overlay
  mechanism, not general union resolution; arbitrary mounts don't
  participate in `os.*` at their target paths at all.
- **Mount SOURCE dirs stay visible/readable at their literal path**
  (`shared/` appears in `readDir "."` and walks fine). So project-level
  mounts are capturable IF the mapping is known — but the walk can't
  discover it (no salient name in `shared/card.html`), so it's either
  parsed from the project config (`layout-dirs.html` already reads it)
  or covered by the params fallback. layoutDir and custom mounts are
  mutually exclusive per Hugo docs, so the two mechanisms never overlap
  on one site.
- **Physical theme/vendor config paths are unshadowable**: mount targets
  must begin with one of the seven component dirs, so nothing can mount
  over `themes/<name>/hugo.toml` or `_vendor/<path>/hugo.toml`.
  Non-vendored module imports remain uncapturable (they live only in the
  Go module cache, unreachable via `os.*`) — `templates.Exists` will
  report their templates present while no source is readable; a `warnf`
  there would be kind.
- Related verified surfaces: `site.Config` exposes only `services` +
  `privacy` (no dir keys — upstream feature request material); the
  default `security.funcs.getenv` allowlist is `['^HUGO_', '^CI$']`
  (securityConfig.go) and Hugo's env binding maps `HUGO_LAYOUTDIR` →
  `layoutdir` (allconfig/load.go: `HUGO` prefix, first rune after the
  prefix is the delimiter) — env overrides are template-readable if the
  params fallback ever needs a sibling.

Accepted pathologies (document, don't fix): a layoutDir literally named
`partials`; `--config` CLI flag invisible; `Exists`-true-but-unreadable
names can't be enumerated as a failure detector (names must come from
the walk first). When implementing: update decision 13 and the
`hugo-custom-dirs` fixture/tests — the fixture's `layoutDir =
"templates"` case should pass through the walk naturally and is the
regression canary.
