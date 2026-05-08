# Liquid live-editing runtime

Browser-side Liquid engine used by the CloudCannon Visual Editor. The Eleventy
plugin (`integrations/eleventy.mjs`) generates a `live-editing.js` bundle at
build time; this directory is what that bundle pulls in.

## How it fits together

```
eleventy.config.mjs            (user)
        │  registers filters / shortcodes / tags via the Eleventy API
        ▼
integrations/eleventy.mjs      (build-time)
        │  walks Eleventy's registries, serializes portable functions,
        │  emits import + register calls for the bundle
        ▼
live-editing.js                (browser)
        │  loaded by the Visual Editor
        ▼
integrations/liquid/index.mjs  (runtime)
        │  instantiates a shared Liquid engine, registers everything,
        │  exposes components on window.cc_components
        ▼
Visual Editor renders components via window.cc_components[name](props)
```

## Entry point

`createSharedLiquidEngine(options)` builds a Liquid engine and stores it in a
module-scoped variable that the other exports read. The generated bundle is
expected to call it exactly once, before any `register…` call; calling it again
would clobber the existing engine and is not guarded against.

The engine uses an in-memory filesystem (`fs.mjs`) backed by `window.cc_files`,
which the bundle pre-populates by `import`ing every `.liquid`/`.html` file
under the configured component directories.

## Globals

Globals are passed to `new Liquid({ globals })` in `index.mjs:108`:

| Global | Status | Notes |
| --- | --- | --- |
| `collections` | Implemented | `Proxy` that lazily resolves `collections.foo` to an array of items via the Visual Editor API. Items shaped roughly like Eleventy's: `{ url, inputPath, data }`. |
| `ENV_CLIENT` | Implemented | Always `true` in this bundle. Templates can branch on it to opt out of build-only logic. |
| `page` | Partial | `Proxy` backed by `CloudCannon.currentFile()`. See below for which properties are supported. |

Other Eleventy-supplied data globals (`eleventy`, `pkg`, etc.) are out of
scope for now.

### `page` properties

Each property access returns a Promise; liquidjs awaits as part of normal
expression evaluation. Source is `CloudCannon.currentFile()` and its front
matter (`file.data.get()`).

| Property | Source | Notes |
| --- | --- | --- |
| `inputPath` | `currentFile().path` | Project-relative; may differ slightly from Eleventy's `./input-dir/...` form. |
| `fileSlug` | derived from `path` | Basename minus extension. |
| `filePathStem` | derived from `path` | Full path minus extension, with a leading `/`. |
| `outputFileExtension` | constant `"html"` | We don't model custom output extensions. |
| `date` | front matter `date` | Coerced to a `Date`. Returns `undefined` if absent or unparseable; we can't see file mtime / git history from the browser. |
| `url` | front matter `permalink`, else derived | If front matter sets `permalink`, that wins. Otherwise we apply Eleventy's default folder-style rule (e.g. `posts/foo.md` → `/posts/foo/`, `posts/index.md` → `/posts/`). Computed permalinks set by 11ty config are not seen. |
| `outputPath` | — | Unimplemented; would need 11ty's output dir + permalink resolution. |
| `templateSyntax` | — | Unimplemented. |
| `lang` | — | Unimplemented (would need the i18n plugin's runtime state). |

The proxy explicitly returns `undefined` for `then` so that awaiting
machinery doesn't mistake the proxy itself for a thenable.

## Filters

Filters are layered as three tiers, resolved in order so later tiers win on
name collision:

1. **Tier 1 — handwritten ports** (`11ty-filters.mjs`). Browser-safe
   reimplementations of common Eleventy built-ins: `slugify`/`slug`, `url`,
   `dateToRfc3339`, `dateToRfc822`, `htmlDateString`,
   `getNewestCollectionItemDate`, the four collection-item filters, and a
   `log` pass-through. Build-time-only filters (`inputPathToUrl`,
   `renderContent`, `renderTemplate`, `htmlBaseUrl`, `serverlessUrl`) are
   registered as warn-once pass-throughs that return their input unchanged.
   Names listed in `tier1FilterNames` are skipped by Tier 2 to avoid
   double-registration.

2. **Tier 2 — auto-mirror from Eleventy's registry**. At build time the
   plugin walks `eleventyConfig.universal.filters` and
   `eleventyConfig.liquid.filters`, runs each function through
   `classifyMirroredSource` (a regex check for `this.ctx`, `require`,
   `process`, `__dirname`, dynamic `import`), and:
   - if portable, embeds the source verbatim via `fn.toString()`
   - if not portable, embeds a warn-once pass-through stub

   Eleventy wraps every registered function in a benchmark closure; the
   serializer unwraps via `__eleventyInternal.callback` so we serialize the
   user's function, not the wrapper.

3. **Tier 3 — explicit overrides** (`pluginOptions.liquid.filters`). A map
   from filter name to module path. Use this when a filter can't be
   serialized (it touches `this.ctx`, requires Node-only modules, etc.) and
   you need to ship a hand-rolled browser version. Tier 3 names are also
   skipped by Tier 2.

## Shortcodes and paired shortcodes

Same Tier 2 + Tier 3 model as filters; there's no Tier 1 (Eleventy ships no
built-in shortcodes). Each registered function is wrapped via
`createShortcodeTag` / `createPairedShortcodeTag` (see `shortcodes.mjs`)
which translates Eleventy's "function returning a string" shape into
LiquidJS's `{ parse, render }` tag shape.

Stubs for non-portable shortcodes return `""` (non-paired) or the inner
content unchanged (paired), so the surrounding template still renders.

## Tags

**Tags are not auto-mirrored.** Register them explicitly via
`pluginOptions.liquid.tags`:

```js
liquid: {
  tags: {
    myTag: "./src/live-editing/my-tag.mjs",
  },
}
```

The module must default-export a factory `(liquidEngine) => ({ parse, render })`
— the same shape `addLiquidTag` expects.

Why tags are different:
- Tag values are factories, not plain functions, so they don't fit the
  `fn.toString()` mirror pattern cleanly.
- Factory bodies typically close over LiquidJS internals (`Tokenizer`,
  `evalToken`, `toPromise`), which would force us to re-export liquidjs
  primitives through our public bundle just so serialized factories could
  resolve them.
- Custom tags are a less common need than custom filters or shortcodes;
  forcing explicit registration keeps the integration surface small.

If a template references an unregistered tag, `enhanceLiquidError` rewrites
LiquidJS's "tag X not found" into an actionable message pointing the user at
`pluginOptions.liquid.tags`.

### Built-in `include_with`

We register one tag of our own: `include_with`, which spreads an object into
an include the way Astro's `{...props}` does:

```liquid
{% include_with "components/card", { title: "Hello", body: page.body } %}
```

It's wired up both in the Eleventy build (so server-rendered output works)
and in `createSharedLiquidEngine` (so live-editing renders match).

## Component resolution

Components are accessed as `window.cc_components[name](props)` and resolve
in this order:

1. **Explicit registrations** via `pluginOptions.liquid.componentOverrides`
   — a map of `name -> module path`. The module's default export is treated
   as Liquid template source.
2. **Proxy fallback** (`initComponentProxy`) — any unregistered name falls
   through to a renderer that runs `{% include "<name>" %}` against the
   shared engine, letting LiquidJS resolve the component via its configured
   `root` directories and `extname`.

Both paths render to a detached `<div>` and return it as an `HTMLElement`.

## Virtual filesystem

LiquidJS reads templates through `inMemoryFs` in `fs.mjs`, which is just a
shim over `window.cc_files`. The bundle pre-populates that map by `import`ing
every matching template file at build time (esbuild's `text` loader inlines
their contents). Extensions are configurable via
`pluginOptions.liquid.extensions`.

## Error enhancement

`enhanceLiquidError` in `index.mjs` rewrites three categories of LiquidJS
error into actionable messages with the component/template name and a
concrete next step:

- Unknown filter → "register it in the `filters` option"
- Missing template (`ENOENT …`) → "check the file is in your component dirs"
- Unknown tag → "register it in `tags`, `shortcodes`, or `pairedShortcodes`"

Anything else falls through with the component name prefixed.

## File map

| File | Purpose |
| --- | --- |
| `index.mjs` | Public entry point: engine, registration functions, component proxy, error enhancement. |
| `11ty-filters.mjs` | Tier 1 filter ports + `tier1FilterNames` skip list consumed by the Eleventy plugin. |
| `shortcodes.mjs` | Adapters that turn Eleventy-style shortcode functions into LiquidJS tag definitions. |
| `fs.mjs` | LiquidJS-compatible filesystem backed by `window.cc_files`. |
| `logger.mjs` | `setVerbose` + `log` / `group` / `warnOnce` helpers used everywhere in the runtime. |
