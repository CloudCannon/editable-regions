# Liquid live-editing runtime

Browser-side Liquid engine used by the CloudCannon Visual Editor. The Eleventy
plugin (`integrations/eleventy.mjs`) generates a `live-editing.js` bundle at
build time; this directory is what that bundle pulls in.

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
| `liquid.filters` | Map of filter name → module path. Tier 3 override. See "Adding a custom filter". |
| `liquid.shortcodes` | Map of shortcode name → module path. Override or addition. See "Adding a custom shortcode". |
| `liquid.pairedShortcodes` | Same as `shortcodes`, for paired shortcodes. |
| `liquid.tags` | Map of tag name → factory module path. **Required** for any custom tag — not auto-mirrored. |

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

### Adding a custom filter

For most filters you don't need to do anything — registering with Eleventy
the normal way is enough; Tier 2 mirrors it automatically.

```js
// eleventy.config.mjs
eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());
// → available in live editing as `{{ "hi" | shout }}` automatically
```

If your filter touches `this.ctx`, `process`, `require`, or `__dirname`,
the auto-mirror replaces it with a warn-once pass-through stub. Add a
browser-friendly override via `pluginOptions.liquid.filters`:

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

## Shortcodes and paired shortcodes

Same Tier 2 + Tier 3 model as filters; there's no Tier 1 (Eleventy ships no
built-in shortcodes). Each registered function is wrapped via
`createShortcodeTag` / `createPairedShortcodeTag` (see `shortcodes.mjs`)
which translates Eleventy's "function returning a string" shape into
LiquidJS's `{ parse, render }` tag shape.

Stubs for non-portable shortcodes return `""` (non-paired) or the inner
content unchanged (paired), so the surrounding template still renders.

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

## Limitations and fallbacks

The runtime can't reproduce everything Eleventy does at build time. This
section catalogues the gaps and the patterns for working around them.

### Things that don't work in live editing

| Area | What happens | Fallback |
| --- | --- | --- |
| `inputPathToUrl`, `renderContent`, `renderTemplate`, `htmlBaseUrl`, `serverlessUrl` filters | Registered as warn-once pass-throughs; return their input unchanged. | Override via `pluginOptions.liquid.filters` if you have a browser-safe equivalent. Otherwise wrap the template path in `{% if ENV_CLIENT %}` and skip it. |
| Filters that touch `this.ctx`, `process`, `require`, `__dirname`, dynamic `import` | Auto-mirror classifies them non-portable; replaced with warn-once pass-through stubs. | Same — `pluginOptions.liquid.filters` override. |
| Shortcodes / paired shortcodes that touch `this.ctx` etc. | Replaced with warn-once stubs returning `""` (non-paired) or the inner content (paired). | `pluginOptions.liquid.shortcodes` / `pluginOptions.liquid.pairedShortcodes`. |
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
| `index.mjs` | Public entry point: engine, registration functions, component proxy, error enhancement. |
| `11ty-filters.mjs` | Tier 1 filter ports + `tier1FilterNames` skip list consumed by the Eleventy plugin. |
| `shortcodes.mjs` | Adapters that turn Eleventy-style shortcode functions into LiquidJS tag definitions. |
| `fs.mjs` | LiquidJS-compatible filesystem backed by `window.cc_files`. |
| `logger.mjs` | `setVerbose` + `log` / `group` / `warnOnce` helpers used everywhere in the runtime. |
