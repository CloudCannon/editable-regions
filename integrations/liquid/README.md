# Liquid live-editing runtime

Browser-side Liquid engine used by the CloudCannon Visual Editor. The Eleventy
plugin (`integrations/eleventy.mjs`) generates a `live-editing.js` bundle at
build time; this directory is what that bundle pulls in.

## Contents

- [What this is for](#what-this-is-for)
- [Install and configure](#install-and-configure)
  - [Plugin options at a glance](#plugin-options-at-a-glance)
- [How it fits together](#how-it-fits-together)
- [Entry point](#entry-point)
- [Globals](#globals)
  - [`page` properties](#page-properties)
  - [Environment variables](#environment-variables)
  - [Eleventy global](#eleventy-global)
- [Filters](#filters)
  - [Adding a custom filter](#adding-a-custom-filter)
  - [Overriding a Tier 1 built-in](#overriding-a-tier-1-built-in)
- [Shortcodes and paired shortcodes](#shortcodes-and-paired-shortcodes)
  - [Adding a custom shortcode](#adding-a-custom-shortcode)
- [Tags](#tags)
  - [Built-in tags](#built-in-tags)
  - [RenderPlugin shims](#renderplugin-shims)
- [Component resolution](#component-resolution)
- [Virtual filesystem](#virtual-filesystem)
- [Error enhancement](#error-enhancement)
- [Limitations and fallbacks](#limitations-and-fallbacks)
  - [Things that don't work in live editing](#things-that-dont-work-in-live-editing)
  - [Patterns](#patterns)
- [File map](#file-map)

## What this is for

This integration powers **live-editing of components** inside the CloudCannon
Visual Editor. The "component" is the unit: a Liquid partial (e.g.
`_includes/card.liquid`) that the editor re-renders client-side as the user
edits its data, without round-tripping through Eleventy.

It is **not** a full client-side replacement for Eleventy. Pages are still
built by Eleventy at build time and served as static HTML. The runtime in
this directory only renders the components the editor swaps in — so anything
that conceptually belongs to the page lifecycle (permalinks, layouts, build
filters, output paths) is either shimmed approximately or deliberately not
implemented. The "Limitations and fallbacks" section below covers the gaps.

## Install and configure

```sh
npm install @cloudcannon/editable-regions
```

Wire the plugin into your `eleventy.config.mjs`:

```js
import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
  // your existing filters, shortcodes, collections, etc.

  eleventyConfig.addPlugin(editableRegions, {
    liquid: {
      extensions: [".liquid"],
      // see "Adding custom …" sections below for filter / shortcode / tag overrides
    },
    env: ["NODE_ENV"],          // optional — see "Environment variables"
    envPrefix: "PUBLIC_",       // optional — see "Environment variables"
  });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
  };
}
```

After every build, the plugin emits `live-editing.js` into your output
directory. Load it on the pages the Visual Editor will render against:

```html
<script src="/live-editing.js" defer></script>
```

### Plugin options at a glance

| Option | Purpose |
| --- | --- |
| `output` | Where to write the bundle. Defaults to `<output>/live-editing.js`. |
| `verbose` | Enable verbose browser logging. |
| `env` | Allowlist of `process.env` names to expose. See "Environment variables". |
| `envPrefix` | Auto-include any env var matching this prefix. See "Environment variables". |
| `liquid.extensions` | Template file extensions to bundle. Defaults to `[".liquid", ".html"]`. |
| `liquid.componentDirs` | Directories to walk for component templates. Defaults to `[directories.includes, directories.input]`. |
| `liquid.ignoreDirectories` | Directory names to skip when walking. Defaults to `[directories.output, "node_modules"]`. |
| `liquid.componentOverrides` | Map of component name → module path. Wins over the proxy fallback. |
| `liquid.filters` | Map of filter name → module path. Browser-side override. See "Adding a custom filter". |
| `liquid.shortcodes` | Map of shortcode name → module path. Browser-side override. See "Adding a custom shortcode". |
| `liquid.pairedShortcodes` | Same as `shortcodes`, for paired shortcodes. |
| `liquid.tags` | Map of tag name → factory module path. **Required** for any custom tag — not auto-mirrored. |

## How it fits together

```
eleventy.config.mjs            (user)
        │  registers filters / shortcodes / tags via the Eleventy API
        ▼
integrations/eleventy.mjs      (build-time)
        │  walks Eleventy's registries, serializes functions via
        │  fn.toString(), emits import + register calls for the bundle
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
| `process.env` | Opt-in | Build-time-filtered subset of the host's `process.env`, exposed only when the user configures `pluginOptions.env` and/or `pluginOptions.envPrefix`. See "Environment variables" below. |
| `eleventy` | Partial | Static object built at build time. See "Eleventy global" below. `pkg` is intentionally not shipped (deprecated upstream, and its data has no business on the client). |

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

### Environment variables

11ty exposes the host's `process.env` to templates at build time. We don't
want to leak the entire host environment to the browser, so the bundle ships
**no** env vars by default. Users opt in two ways, which can be combined:

```js
eleventyConfig.addPlugin(editableRegions, {
  liquid: { /* ... */ },

  // Explicit allowlist — recommended.
  env: ["API_BASE_URL", "FEATURE_FLAGS"],

  // Optional Vite-style prefix convention.
  envPrefix: "PUBLIC_",
});
```

At build time, `eleventy.mjs` reads `process.env`, filters by the allowlist
and (if set) the prefix, and embeds the resulting object as a JSON literal in
the bundle. The runtime call is `registerProcessEnv(env)`, which sets
`engine.globals.process = { env }`. Templates then read it the same way 11ty
does:

```liquid
<a href="{{ process.env.API_BASE_URL }}">…</a>
```

Notes:
- Reading `process.env` happens once, in Node, at build time. The browser
  never sees the host process; only the values you allowlist make it into
  the bundle.
- Empty-string prefixes are ignored (every env-var name starts with `""`,
  which would defeat the point).
- Names listed in `env` that aren't actually set in `process.env` are
  silently dropped — no template-time error.
- Whatever you ship in here ends up in static JS that the browser downloads.
  Don't allowlist secrets.

### Eleventy global

A static `eleventy` object is registered alongside `collections` and `page`,
built once at build time:

| Property | Source | Notes |
| --- | --- | --- |
| `eleventy.version` | resolved from `@11ty/eleventy/package.json` | Falls back to `"unknown"` if Eleventy can't be resolved (so the bundle still builds). |
| `eleventy.generator` | `"Eleventy v" + version` | Useful in feed/sitemap templates. |
| `eleventy.env.runMode` | hardcoded `"serve"` | We're not in any of 11ty's real run modes; "serve" is the dev-mode analogue. Templates branching on `runMode` see this as the "live" path. |
| `eleventy.env.source` | hardcoded `"cli"` | Same idea — pick the most-common analogue so branches don't go down a build-only path. |
| `eleventy.env.config` / `env.root` | — | Deliberately omitted. These are absolute filesystem paths and have no place in client JS. |
| `eleventy.directories` | from the build's `directories` payload | `{ input, includes, data, output }`. |
| `eleventy.serverless` | — | Deprecated upstream, not shipped. |

## Filters

Filters are layered as three tiers, resolved in order so later tiers win on
name collision:

1. **Tier 1 — handwritten ports** (`11ty-builtins.mjs`). Browser-safe
   reimplementations of common Eleventy built-ins: `slugify`/`slug`, `url`,
   `dateToRfc3339`, `dateToRfc822`, `htmlDateString`,
   `getNewestCollectionItemDate`, the four collection-item filters, and a
   `log` pass-through. Filters that depend on build-time-only state
   (`inputPathToUrl`, `htmlBaseUrl`, `serverlessUrl`) are registered as
   warn-once pass-throughs that return their input unchanged. The
   RenderPlugin filter `renderContent` is registered as a real shim that
   parse-and-renders its input via the shared Liquid engine — see
   "RenderPlugin shims" below. Names listed in `tier1FilterNames` are
   skipped by Tier 2 to keep the auto-mirror from overwriting our ports
   with Eleventy's Node-only defaults (which close over imports like
   `@sindresorhus/slugify` that don't exist in the browser).

2. **Tier 2 — auto-mirror from Eleventy's registry**. At build time the
   plugin walks `eleventyConfig.universal.filters` and
   `eleventyConfig.liquid.filters` and embeds each function verbatim via
   `fn.toString()`. There's no portability heuristic — the function is
   shipped as-is. If it depends on Eleventy build-time state (`this.ctx`,
   `process`, `require`, `__dirname`, a closed-over Node import, …) it'll
   throw at render time in the browser, which is the signal to add a Tier
   3 override.

   Eleventy wraps every registered function in a benchmark closure; the
   serializer unwraps via `__eleventyInternal.callback` so we serialize
   the user's function, not the wrapper.

3. **Tier 3 — explicit overrides** (`pluginOptions.liquid.filters`). A map
   from filter name to module path. Two reasons to use this:
   - **A mirrored filter throws at render time.** The Tier 2 entry isn't
     safe to run in the browser — supply a hand-rolled replacement here.
   - **You're overriding a Tier 1 name.** Tier 2 skips Tier 1 names to
     protect our browser ports, which means an `eleventyConfig.addFilter("url", …)`
     won't reach live editing. To override a Tier 1 filter in the bundle
     you must also register here.

   Tier 3 names are also skipped by Tier 2 (so an override doesn't get
   double-registered).

### Adding a custom filter

For most filters you don't need to do anything — registering with Eleventy
the normal way is enough; Tier 2 mirrors it automatically.

```js
// eleventy.config.mjs
eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());
// → available in live editing as `{{ "hi" | shout }}` automatically
```

If your filter touches `this.ctx`, `process`, `require`, `__dirname`, or a
closed-over Node module, the Tier 2 mirror will ship it but it'll throw at
render time in the browser. Surface the actionable path by adding a Tier 3
override:

```js
// eleventy.config.mjs
eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    filters: {
      currentPageUrl: "./live-editing-overrides/current-page-url.mjs",
    },
  },
});
```

```js
// live-editing-overrides/current-page-url.mjs
export default function () {
  return globalThis.location?.pathname ?? "";
}
```

The override module's default export is registered against the live-editing
engine in place of the original. The Eleventy server-side filter is
untouched.

### Overriding a Tier 1 built-in

If you replace a Tier 1 name in your Eleventy config —
`eleventyConfig.addFilter("url", myCustomUrl)` — your replacement applies
server-side, but the live-editing bundle still uses our handwritten port
(Tier 2 skips Tier 1 names). To make the override apply in the bundle too,
register a second time via `pluginOptions.liquid.filters`:

```js
// eleventy.config.mjs
eleventyConfig.addFilter("url", myCustomUrl);          // server-side

eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    filters: {
      url: "./live-editing-overrides/url.mjs",         // live editing
    },
  },
});
```

It's a tax, and it only applies to Tier 1 names. The alternative — letting
the auto-mirror ship Eleventy's defaults — breaks every project that uses
`{{ x | url }}` without overriding, because Eleventy's default `url`
filter closes over Node-only imports that don't survive `fn.toString()`.
The skip protects users who don't override; the second registration
unlocks the path for users who do.

## Shortcodes and paired shortcodes

Same Tier 1 / Tier 2 / Tier 3 model as filters. Each registered function is
wrapped via `createShortcodeTag` / `createPairedShortcodeTag` (see
`shortcodes.mjs`) which translates Eleventy's "function returning a string"
shape into LiquidJS's `{ parse, render }` tag shape.

The only Tier 1 shortcode is `renderFile` (from the RenderPlugin) — see
"RenderPlugin shims" below. Tier 2 ships everything the user registered
via `addShortcode` / `addPairedShortcode` verbatim. Tier 3 lives under
`pluginOptions.liquid.shortcodes` / `pluginOptions.liquid.pairedShortcodes`
for browser-friendly replacements.

Like filters, the auto-mirror has no portability heuristic — non-portable
shortcodes throw at render time and direct you to add a Tier 3 override.

### Adding a custom shortcode

Like filters: register with Eleventy as normal and the auto-mirror handles
it.

```js
// eleventy.config.mjs
eleventyConfig.addShortcode("year", () => new Date().getFullYear());
// → `{% year %}` works in live editing automatically
```

For paired shortcodes, use `addPairedShortcode`:

```js
eleventyConfig.addPairedShortcode("highlight", (content, color = "yellow") =>
  `<mark style="background:${color}">${content}</mark>`,
);
// → {% highlight "lime" %}note{% endhighlight %}
```

If a shortcode reads from Eleventy's runtime state (`this.page`,
`this.ctx`, etc.), provide a browser override via
`pluginOptions.liquid.shortcodes` or `pluginOptions.liquid.pairedShortcodes`,
same shape as the filter override above.

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

### Built-in tags

The runtime registers a few tags of its own at engine creation time. Users
don't have to do anything to get these.

**`includeWith`** — spreads an object into an include the way Astro's
`{...props}` does. Wired up in both the Eleventy build (so server-rendered
output works) and `createSharedLiquidEngine` (so live editing matches):

```liquid
{% includeWith "components/card", { title: "Hello", body: page.body } %}
```

**`renderTemplate`** — RenderPlugin shim. A paired tag that compiles the
body as a Liquid template and renders it against the supplied data:

```liquid
{% renderTemplate "liquid", { name: "Tom" } %}
  Hello {{ name }}
{% endrenderTemplate %}
```

Only `"liquid"` and `"html"` engines are supported in the browser (other
engines warn once and return the body unchanged). See `11ty-render.mjs`.

`renderFile` and `renderContent` are also part of the RenderPlugin shim —
documented in the next section since they're shortcode/filter rather than
tag-shaped.

### RenderPlugin shims

Eleventy's `RenderPlugin` (auto-loaded in 11ty 3.x) registers three
template-side helpers. We reimplement all three in the browser, scoped to
the engines we actually run there:

| Helper | Shape | Usage |
| --- | --- | --- |
| `renderTemplate` | paired Liquid tag | `{% renderTemplate "liquid", data %}…{% endrenderTemplate %}` |
| `renderFile` | async shortcode | `{% renderFile "path/to/file.liquid", data %}` |
| `renderContent` | async filter | `{{ rawString \| renderContent: "liquid", data }}` |

All three share the same behaviour: `"liquid"` (or unspecified) → real
parse-and-render through the shared engine; `"html"` → identity
passthrough; any other engine → warn-once and return the body unchanged.
`renderFile` reads from `window.cc_files` (populated at build time by
`findAllLiquidFiles`) rather than the filesystem, so the referenced file
has to live inside a configured `componentDir` with a supported extension.

## Component resolution

Components are accessed as `window.cc_components[name](props)`. There are
two resolution paths; the proxy is the primary one and the explicit map is
the override.

1. **Include-resolution proxy** (`initComponentProxy`, the primary path).
   `window.cc_components` is wrapped in a Proxy whose `get` trap returns,
   for any unrecognised name, a renderer that runs `{% include "<name>" %}`
   against the shared engine. LiquidJS resolves the component file via its
   configured `root` directories and `extname` — which is how every
   auto-discovered component (from `findAllLiquidFiles`) becomes reachable
   without anyone calling `registerLiquidComponent` for it.
2. **Explicit registrations** via `pluginOptions.liquid.componentOverrides`
   — a map of `name -> module path`. The module's default export is
   treated as Liquid template source and ends up directly in
   `window.cc_components[name]`, so the Proxy's `get` trap returns it
   verbatim (without going through include resolution). Use this when you
   want to substitute a different template for a specific name.

Both paths render to a detached `<div>` and return it as an `HTMLElement`.
The shared rendering logic lives in `createComponentRenderer` (in
`index.mjs`), so the two paths produce identical output, error handling,
and logging.

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

## Limitations and fallbacks

The runtime can't reproduce everything Eleventy does at build time. This
section catalogues the gaps and the patterns for working around them.

### Things that don't work in live editing

| Area | What happens | Fallback |
| --- | --- | --- |
| `inputPathToUrl`, `htmlBaseUrl`, `serverlessUrl` filters | Registered as warn-once pass-throughs; return their input unchanged (they depend on Eleventy build-time state we don't have). | Override via `pluginOptions.liquid.filters` if you have a browser-safe equivalent. Otherwise wrap the template path in `{% if ENV_CLIENT %}` and skip it. |
| `renderTemplate` / `renderFile` / `renderContent` with a non-Liquid engine arg (e.g. `"njk"`, `"md"`) | Warn-once and return the body unchanged. We only ship LiquidJS in the bundle. | Switch the template to Liquid, or guard the call with `{% if ENV_CLIENT %}` so it only runs at build time. |
| Mirrored filters/shortcodes that touch `this.ctx`, `process`, `require`, `__dirname`, or a closed-over Node import | Auto-mirror ships them verbatim; they throw at render time in the browser. The thrown error is wrapped by `enhanceLiquidError` with the filter/shortcode name. | Add a `pluginOptions.liquid.filters` (or `.shortcodes` / `.pairedShortcodes`) override pointing at a browser-safe replacement. |
| User overrides of a **Tier 1** filter name via `eleventyConfig.addFilter` | The auto-mirror skips Tier 1 names, so the override doesn't reach the bundle — live editing keeps using our handwritten port. | Also register the override in `pluginOptions.liquid.filters`. See "Overriding a Tier 1 built-in". |
| Custom Liquid tags | Not auto-mirrored. Templates referencing an unregistered custom tag will fail with an enhanced "tag X not found" error. | Register every tag you want available via `pluginOptions.liquid.tags`. |
| `page.outputPath`, `page.templateSyntax`, `page.lang` | `undefined`. | If you need them, read from front matter / `_data/` instead, or skip the branch via `ENV_CLIENT`. |
| `page.url` for templates relying on computed permalinks set in `eleventy.config.mjs` | Falls back to a derived folder-style URL. | Set `permalink:` in front matter so the runtime can read it directly. |
| `page.date` from file mtime / git history | `undefined` if not in front matter. | Set `date:` in front matter. |
| `eleventy.env.config`, `eleventy.env.root` | Deliberately omitted (absolute filesystem paths). | Don't reference these from a component. |
| `eleventy.env.runMode`, `eleventy.env.source` | Hardcoded to `"serve"` / `"cli"`. | If you need a "we're in the editor" branch, use `ENV_CLIENT` instead. |
| `pkg`, `pagination`, `eleventy.serverless` | Not exposed. | `pkg` data → put it in `_data/`. Pagination is build-time-only. |
| Layout files | Not rendered by the live runtime; the page's HTML stays as Eleventy built it. | Layout-dependent logic should live in the component, not the layout, if you want it editable. |

### Patterns

**Branching on "are we in the editor?".** Use the `ENV_CLIENT` global, which
is `true` in the live-editing bundle and `false`/undefined during the
Eleventy build:

```liquid
{% if ENV_CLIENT %}
  <p>Editing — placeholder shown.</p>
{% else %}
  {{ collections.posts | someBuildOnlyFilter }}
{% endif %}
```

This is the right escape hatch for build-only logic that you don't want
running in the editor at all.

**Overriding a single filter / shortcode / tag with a browser version.**
Point the relevant `pluginOptions.liquid.{filters,shortcodes,pairedShortcodes,tags}`
entry at a module that default-exports a browser-safe replacement. The
override only applies to live editing — your Eleventy server-side
registration keeps working unchanged.

**Replacing an entire component for live editing.** If a single component
has too many incompatibilities to override piecemeal, register a
component-specific renderer via `pluginOptions.liquid.componentOverrides`:
the module's default export is treated as Liquid template source for that
component name, fully replacing what's on disk.

**When you need data the shims don't have.** Pull from `_data/` (which
becomes the front matter / data cascade and is readable via the
`collections` proxy), or from the CloudCannon JS API directly in a custom
tag or filter override. The Visual Editor exposes `currentFile()`,
`collection(key)`, `dataset(key)`, and `file(path)` — see the existing
`page` proxy in `index.mjs` for a reference implementation.

## File map

| File | Purpose |
| --- | --- |
| `index.mjs` | Public entry point: engine, registration functions, component proxy, render helper, error enhancement. |
| `11ty-builtins.mjs` | Tier 1 filter/shortcode ports + `tier1FilterNames` / `tier1ShortcodeNames` skip lists. Exposes `registerEleventyBuiltins(engine)` which `createSharedLiquidEngine` calls to wire all 11ty built-ins onto the engine in one shot. |
| `11ty-render.mjs` | RenderPlugin shims: `createRenderTemplateTag` (paired Liquid tag), `createRenderFileShortcode`, `createRenderContentFilter`. |
| `shortcodes.mjs` | Adapters that turn Eleventy-style shortcode functions into LiquidJS tag definitions. Also exports the shared `parseArgs` / `evaluateArgs` helpers used by `11ty-render.mjs`. |
| `fs.mjs` | LiquidJS-compatible filesystem backed by `window.cc_files`. |
| `logger.mjs` | `setVerbose` + `log` / `group` / `warnOnce` helpers used everywhere in the runtime. |
