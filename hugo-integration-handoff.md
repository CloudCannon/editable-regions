# Hugo integration: handoff (2026-08-21)

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
`editable-regions/resources.html` builds a snapshot context (verbatim
template capture — project + theme + vendored-module trees — plus verbatim
site-config capture + a fingerprinted WASM URL), renders the entry asset
`browser/entry.js` with it
via `resources.ExecuteAsTemplate`, bundles with `js.Build` (minify off under
`hugo.IsDevelopment`), fingerprints, and `editable-regions.html` emits the
single `<script>` (SRI + defer).

In the browser the runtime boots real Hugo (GOOS=js WASM, hugolib over afero
memfs) lazily once the CloudCannon API appears, then:

- **Templates + config**: captured **verbatim at their physical paths** at
  build time, never re-keyed or re-serialized. `find-template-files.html`
  walks the project tree for `partials/`, `_default/_markup/`, and
  `shortcodes/` trees; a directory whose path ends in a `hugo.Deps` entry
  (from `load-deps.html` — a `themes/<theme>` or `_vendor/<import>` path) is
  handed to `find-dep-template-files.html`, which resolves that dependency's
  `module.mounts` (`os.ReadFile` + `transform.Unmarshal`) and captures its
  template trees plus its root config files at their physical paths.
  `find-config-files.html` captures the site's own root `hugo.*`/`config.*`
  and everything under `config/`, also verbatim (`_vendor/modules.txt` is
  mirrored likewise when it exists). Kind layouts are simply never walked
  (only `_default/_markup`, not `_default/*`), so they can't shadow the
  renderer's dispatch layout. Nothing is normalized onto `layouts/` or
  stripped of `theme`/`module` — the editor's renderer loads all of it
  through Hugo's own composite-FS + config resolution, so `theme`, vendored
  imports, mounts, and relocated dirs resolve exactly as the real site does.
- **Content + data** (mirrored at boot, never snapshotted): every CloudCannon
  collection item becomes a content stub (front matter only, blank body) and
  every dataset item a data file, each written **verbatim at its source
  path** under the site's real `content/`/`data/` dirs — no content-dir
  filtering, anything a collection yields is content. The dirs themselves
  are the renderer's own: the snapshot carries the site's config files
  verbatim, and the renderer loads them through Hugo's native
  `allconfig.LoadConfig` (config-dir `config`, environment from the `cc-env`
  carrier written from `hugo.Environment`) — so compiled
  `contentDir`/`dataDir`/`layoutDir`/`theme`/module mounts match the site's
  exactly and relocated trees land where Hugo reads them. The editable-
  regions self-import can't resolve in the in-memory FS and is skipped via
  `IgnoreModuleDoesNotExist`. Publishing is kept to two pages: the boot-time
  current file opts its stub in with `build.render: always`; the home page's
  publishing is the **renderer's own cascade** (`editorFlags` prepends a
  `_target: {kind: home, build: {render: always}}` entry ahead of the
  link-default cascade), so it survives any stub rewrite and never adds a
  file write to a render build.
- **Freshness**: the runtime subscribes to each mirrored collection's and
  dataset's `change`/`delete` events; a change re-fetches the file, rewrites
  its stub/data file, and runs a build-only rebuild — one write per build,
  preserving the single-write invariant.
- **Rendering**: each component render rewrites only the headless `cc-dispatch`
  request page (`partial` + props via goccy YAML front matter) and runs an
  incremental build; the current page re-renders through its dependency on
  the dispatch page, so components see `page` bound to the edit target. The
  renderer then resolves the built page whose `File().Path()` matches the
  request's **verbatim target file path** (joined with `Cfg.Base.ContentDir`)
  and reads that page's `.RelPermalink` output — Hugo's own file→page
  mapping, so neither side computes page paths; unmatched/no target falls
  back to home. A missing partial is caught **in the dispatch layout** via
  `templates.Exists` (name candidates `partials/<key>[.html|.htm]`) and
  rendered as a marker the runtime turns into the clean component error.

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
11. **Full-site rendering is suppressed with a mix of `disableKinds` and a
    build-render cascade, both renderer-owned (`editorFlags`)**
    (probe-verified): `disableKinds` drops `taxonomy`/`term`/`RSS`/`sitemap`/
    `robotsTXT`/`404` so those kinds never render in the editor, and
    `cascade: [{build: {render: "link"}}]` keeps every content page in the
    store while suppressing per-page output. Two pages publish: the boot-time
    current file (its stub carries `build: {render: always}`) and the home
    page (a home-targeting `build: {render: always}` cascade entry prepended
    ahead of the link-default entry). Pages stay in the store
    (collections/.Content/.RelPermalink all work) while only those two
    publish.
12. **The page map is removed.** `window.cc_hugo_pages`/`runtimeData.pages`
    are gone — the CloudCannon API already enumerates files at runtime;
    re-add only when a concrete consumer defines what it needs.
13. **Custom directories — SUPERSEDED (2026-08-13) by the salient walk, and
    again (this branch) by verbatim config/template mirroring.** The old
    `layout-dirs.html` probe is gone, as are the salient walk
    (`walk-project.html` — now dead code), `walk-modules.html`, and the
    `template_dirs` override (dropped in the verbatim rework). Config files
    and templates are captured at their physical paths and the renderer
    loads them through Hugo's native config + composite-FS resolution, so
    relocated *content/data/layout* dirs, `theme`, vendored imports, and
    `module.mounts` all resolve the way the real site resolves them with
    zero config-awareness in the walk itself. `layoutDir` is never forwarded
    — the editor's forwarded files carry only physical paths.

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
- **Config-dir files with non-config basenames are wrapped, not merged**: a
  file like `config/production/zz-neut.json` lands under a `zz-neut:` key and
  **never overrides root keys** — only `config.*`/`hugo.*` (or the known
  section names `menu.*`/`params.*`/`languages.*`/…) apply at the expected
  place. (The editor no longer "neutralizes" config at all — it loads the
  site's config verbatim — so this only matters when reasoning about what a
  config-dir file does in the editor build.)
- **Root config + config dir merge, dir wins on conflicts** (probe-verified,
  v0.164.0): with both present, the root file loads first and
  `config/_default` + `config/<env>` merges on top — a root-only key (e.g.
  `disableKinds`) survives; a dir key (e.g. `contentDir`) defeats the root's.
  Within the root slot `hugo.*` beats `config.*`, and formats resolve
  `toml > yaml > yml > json`; within `_default`, `hugo.*` beats `config.*`.
  The config-mirror tests pin exactly this (`config-mirror-dirs.test.ts`).
- **The editor adds no config file of its own.** It loads the site's real
  config (captured verbatim at build time) plus the `editorFlags()`
  overrides (`disableKinds` and the publishing cascade), which `loadConfig`
  passes as flags — flags beat any config-file setting, and nothing is
  re-serialized or renamed, so there's no name-collision surface.
- **Init ordering in the renderer**: `initHugoEditorSite` calls `loadConfig()`
  first, then writes the dispatch layout (under the resolved `layoutDir`),
  the headless dispatch page, and any missing home stub (under the resolved
  `contentDir`) — all *before* `createSites()`, or Hugo's first Running
  build won't re-render them into the store.
- **`errorf` doesn't abort template execution**: it logs the message and
  execution FALLS THROUGH to the next action, so a layout doing
  `errorf`+`errorf`-only-then-partial would still hit the partial call; and
  the build then surfaces only the aggregate "logged N errors" (Hugo exposes
  `NumLogErrors()` but no accessor for the error text). Hence the
  missing-partial **marker** approach: the check happens in-template with
  `templates.Exists` but renders a `<cc-missing-partial>` element the runtime
  turns into the clean error — the build stays green.

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
  path minus leading slash) under the site's real `content/`/`data/` dirs
  before `initHugoEditorSite`, then subscribes per collection/dataset.
  Dataset contents serialize by extension: YAML via `serializeData` (bare
  doc, array roots OK), JSON via `JSON.stringify` (float64 decoding matches
  Hugo's native JSON data); TOML/CSV datasets fall back to YAML (known gap —
  the API only exposes parsed data). The browser performs **no dir- or
  path-shape logic**: no content filter (collections define content),
  `sessionFile` (verbatim current-file path) drives both the render request's
  `target` and the boot-time opt-in, and home identity lives entirely in the
  renderer (`editorFlags` cascade + the `removeHugoFiles` home guard).
- **Config capture** (`find-config-files.html` at build time + `loadConfig`
  in the renderer): the snapshot carries the site's root `hugo.*`/`config.*`
  and everything under `config/` **verbatim at their physical paths**, plus
  (for themes/vendored modules) each dependency's own root config files
  captured by `find-dep-template-files.html`. In `initHugoEditorSite` the
  renderer loads them through Hugo's native `allconfig.LoadConfig` (ConfigDir
  `config`, environment from the `cc-env` carrier, `IgnoreModuleDoesNotExist:
  true` so the editable-regions self-import — whose replacement points at the
  repo on disk — can't fail the load) with the `editorFlags()` overrides as
  flags. Compiled `contentDir`/`dataDir`/`layoutDir`/`theme`/module mounts
  come straight off the result, so relocated trees, `theme`, and vendored
  modules resolve exactly as the real site does — no precedence rules are
  re-implemented. No config file is re-serialized, renamed, or stripped, and
  the editor writes no config file of its own.
  Deleted with this pass: `toHugoPagePath`/`urlizeSegment` (JS page-path
  computation — the renderer resolves by file path),
  `partialsPrefix`/`resolvePartialName`/`availablePartials` (browser partial
  resolution — the dispatch layout's `templates.Exists` check handles
  existence), and the earlier `mirrorSiteConfig`/`learnSiteConfigDirs`/
  `configureEditorSite`/`cc-editor.json` JSON-renaming config mirror.
- **Theme + vendored-module capture** (`find-dep-template-files.html`): a
  directory whose path ends in a `hugo.Deps` entry — a `themes/<theme>` or
  `_vendor/<import>` path — is resolved as a dependency. Its `module.mounts`
  are probed (`os.ReadFile` + `transform.Unmarshal` on its root config) to
  pick the source dirs that carry templates (mounts present) or the default
  `layouts/{partials,_default/_markup,shortcodes}` trees (no mounts); files
  are captured **verbatim at their physical paths below the dependency
  root**, and its root `hugo.*`/`config.*` are captured too, so the renderer
  resolves it the way the real site does. Content/data from those layers stay
  uncaptured; non-vendored go-module imports live in the module cache, which
  templates can't reach — `hugo mod vendor` or a local copy.
- **Props typing**: props travel as goccy YAML front matter on the dispatch
  page (not JSON — JSON decodes every number as float64); `integralizeNumbers`
  canonicalizes integral floats to ints; date-looking strings stay quoted.
  `printf "%d"` works on whole numbers and large ids.

## Open items (in suggested order)

- **Mirror the site's configured taxonomies** (design settled, not landed).
  Tag clouds/`site.Taxonomies`/term `site.GetPage` render wrong because the
  editor build uses Hugo's default dimensions and `editorFlags` disables
  taxonomy/term kinds. Now that the renderer loads the site's real config
  natively, its `taxonomies` are already on the loaded `allconfig.Configs` —
  the work left is to stop disabling taxonomy/term and splice the site's
  configured taxonomies into the editor build, then verify
  `site.Taxonomies` membership and term resolution in the WASM (the cascade
  already suppresses their output). Terms come only from loaded stubs' front
  matter.
- **Config-capture gaps** (landed, with documented edges): per-language
  `contentDir` inside `[languages.*]` isn't handled (only the root config's
  dirs matter for the single-language editor site); config changes
  mid-session aren't tracked (the config is captured at build time and fixed
  at boot, matching the "navigating reboots the editor" model); a custom
  `configDir` isn't rolled (the renderer pins ConfigDir to `config`); and
  only the snapshot's build environment is carried (`cc-env` from
  `hugo.Environment`), so a site must build the editor with its production
  environment for production-only dir overrides to apply.
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
- **Bodies remain blank** until a demonstrated need (decision 10).
- **Small**: WASM startup readiness is a `setTimeout(10ms)` poll for
  `globalThis.renderHugoPartial` — the Go side could signal explicitly.
  `find-files-with-extension.html`/`find-template-files.html` merge in a loop
  (O(n²)) — fine at partial scale. `hugo-integration-shape.md` describes the
  superseded output-format plan; keep as historical record or refresh.
