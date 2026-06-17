# Liquid live-editing runtime

Browser-side Liquid engine used by the CloudCannon Visual Editor. The Eleventy
plugin (`integrations/eleventy/index.mjs`) generates a `register-components.js` bundle at
build time; this directory is what that bundle pulls in.

## Contents

- [What this is for](#what-this-is-for)
- [Install and configure](#install-and-configure)
  - [Plugin options at a glance](#plugin-options-at-a-glance)
- [How it fits together](#how-it-fits-together)
- [Globals](#globals)
  - [`page` properties](#page-properties)
  - [Custom globals](#custom-globals)
  - [Eleventy global](#eleventy-global)
  - [`pkg` global](#pkg-global)
- [Filters](#filters)
  - [Adding a custom filter](#adding-a-custom-filter)
  - [Overriding a built-in](#overriding-a-built-in)
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

Wire the plugin into your `eleventy.config.mjs`. The minimal case is one
line — Liquid is the plugin's default language and is enabled implicitly:

```js
import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
  // your existing filters, shortcodes, collections, etc.

  eleventyConfig.addPlugin(editableRegions);

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
  };
}
```

To customise — environment variables, output path, or Liquid-specific
options:

```js
eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    extensions: [".liquid"],
    // see "Adding custom …" sections below for filter / shortcode / tag overrides
  },
  globals: {                  // optional — see "Custom globals"
    env: { API_BASE: process.env.API_BASE },
  },
});
```

`liquid` accepts `true` (defaults), `false` (disable Liquid live editing),
or an options object. Future languages will follow the same shape but
default to off — users will opt in via e.g. `nunjucks: true`.

After every build, the plugin emits `register-components.js` into your
output directory. The filename and location are configurable via the
`output` plugin option (see the table below) — the default sits next to
the rest of your built assets so it's reachable as
`/register-components.js`.

Load it on every page the Visual Editor will render against, guarded on
the editor's runtime flag so production pages don't pay the cost outside
the editor:

```html
<script>
  if (window.inEditorMode) {
    import("/register-components.js").catch((error) => {
      console.warn("Failed to load CloudCannon component registration:", error);
    });
  }
</script>
```

`window.inEditorMode` is set to `true` by the CloudCannon Visual Editor
before page scripts run; outside the editor it's `undefined`, so the
dynamic import never fires. If you'd rather always load the bundle
(useful while iterating locally), a plain `<script src="/register-components.js" defer>`
works too.

### Plugin options at a glance

| Option | Purpose |
| --- | --- |
| `output` | Where to write the bundle. Defaults to `register-components.js` inside Eleventy's `dir.output`. |
| `verbose` | Enable verbose browser logging. |
| `globals` | Extra globals to expose to editor-rendered templates (JSON-serialisable). See "Custom globals". |
| `liquid.extensions` | Template file extensions to bundle. Defaults to `[".liquid", ".html"]`. |
| `liquid.componentDirs` | Directories to walk for component templates. Defaults to `[directories.includes, directories.input]`. |
| `liquid.ignoreDirectories` | Directory names to skip when walking. Defaults to `[directories.output, "node_modules"]`. |
| `liquid.components` | Map of component name → module path. Wins over the filesystem-resolution proxy. |
| `liquid.filters` | Map of filter name → module path. Browser-side override. See "Adding a custom filter". |
| `liquid.shortcodes` | Map of shortcode name → module path. Browser-side override. See "Adding a custom shortcode". |
| `liquid.pairedShortcodes` | Same as `shortcodes`, for paired shortcodes. |
| `liquid.tags` | Map of tag name → factory module path. Browser-side override. Tags auto-mirror from the config like filters/shortcodes; use this only for a tag that can't run in the browser as written. |
| `liquid.configPath` | Path to the Eleventy config file to import and replay for the auto-mirror, relative to the project root. Defaults to the first of 11ty's standard names that exists (`.eleventy.js`, `eleventy.config.{js,mjs,cjs}`). Set only if you run Eleventy with a non-default `--config`. |
| `liquid.browserStub` | Extra bare module specifiers to stub out of the browser bundle, on top of the 11ty toolchain and Node built-ins (always stubbed). Use when the config imports a native/Node-only package (e.g. `sharp`) that no browser-bound helper actually calls. |
| `liquid.pageMap` | Ship a build-time `inputPath → { url, outputPath }` map (default `true`). Used by the page / collections proxies and `inputPathToUrl` to resolve computed permalinks accurately. Costs ~100 bytes per page in the bundle; set to `false` for very large sites that don't need editor-time URL accuracy. |

## How it fits together

After every build, the plugin emits a single `register-components.js` bundle
that the Visual Editor loads. Two things are picked up at build time and wired
into that bundle:

- **Filters, shortcodes, and tags** — auto-mirrored from your Eleventy config
  (see "Filters" below).
- **Components** — every template under the configured component directories
  (`liquid.componentDirs`, defaulting to `dir.includes` and `dir.input`),
  matching `liquid.extensions`.

In the browser, the bundle instantiates a shared Liquid engine, registers
everything, and resolves each component on demand via `{% include %}`. See
"Component resolution" for how component names map to templates.

## Globals

Globals are passed to `new Liquid({ globals })` inside `createSharedLiquidEngine`:

| Global | Status | Notes |
| --- | --- | --- |
| `collections` | Implemented | `Proxy` that lazily resolves `collections.foo` to an array of items via the Visual Editor API. Items shaped roughly like Eleventy's: `{ url, inputPath, data }`. |
| `ENV_CLIENT` | Implemented | Always `true` in this bundle. Templates can branch on it to opt out of build-only logic. |
| `page` | Partial | `Proxy` backed by `CloudCannon.currentFile()`. See below for which properties are supported. |
| custom globals | Opt-in | Whatever you pass via `pluginOptions.globals` (e.g. an `env` object), embedded at build time. See "Custom globals" below. |
| `eleventy` | Partial | Static object built at build time. See "Eleventy global" below. |
| `pkg` | Implemented | Project `package.json`, mirrored verbatim. See "`pkg` global" below. |

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
| `url` | live `permalink`, else build-time page map, else folder-style derivation | Priority: a *literal* front-matter `permalink` (captures editor-time edits) → build-time page-map lookup → 11ty's folder-style default. A `permalink` containing template syntax (e.g. `"/{{ page.date \| date: '%Y/%m/%d' }}/"`) is skipped here and resolved via the page map, which holds 11ty's already-rendered value. The map ships by default; opt out via `liquid.pageMap: false`. |
| `outputPath` | live `permalink` joined with `directories.output`, else build-time page map, else folder-style default joined with `directories.output` | Same priority hierarchy as `url` (templated permalinks likewise fall through to the page map). Build-map lookup uses 11ty's exact `outputPath` (so `index.html` joining matches what 11ty wrote). Returns `undefined` only if neither the map nor `registerEleventyData` have run. |
| `templateSyntax` | — | Unimplemented. |
| `lang` | — | Unimplemented (would need the i18n plugin's runtime state). |

### Custom globals

11ty doesn't expose `process.env` to templates — global data reaches them by
name instead (a `_data/env.js` file becomes `{{ env.* }}`, or
`addGlobalData("env", …)`). The live-editing runtime doesn't auto-load your
global data, so anything a component reads that isn't `page` / `collections` /
`eleventy` / `pkg` has to be passed in explicitly via `pluginOptions.globals`.
Mirror whatever your build already exposes, so the editor and build agree:

```js
const env = { API_BASE: process.env.API_BASE };

eleventyConfig.addGlobalData("env", env); // server-side build

eleventyConfig.addPlugin(editableRegions, {
  globals: { env }, // live editing
});
```

Templates then read it by name, identically in both places:

```liquid
<a href="{{ env.API_BASE }}">…</a>
```

The object is embedded into the bundle as a JSON literal at build time, so
values must be JSON-serialisable (no functions). The built-in globals
(`page`, `collections`, `eleventy`, `pkg`) are applied separately and win on a
name collision.

> ⚠️ **Never include secrets.** Anything in `globals` is embedded verbatim
> into the static JS bundle the browser downloads. Treat it like Vite's
> `PUBLIC_` or Next's `NEXT_PUBLIC_` convention: public-by-design only. Keep
> API keys, tokens, signing secrets, and database URLs out of it.

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

### `pkg` global

11ty exposes the project's `package.json` as the `pkg` global by default
(`config.keys.package = "pkg"`). We mirror it verbatim — `pkg.name`,
`pkg.version`, `pkg.description`, `pkg.author`, `pkg.homepage`, and any other
top-level fields the consumer has set are available in editable templates the
same way they are server-side.

If `package.json` is missing or malformed at build time, the bundle skips
`registerPkg` entirely and `pkg` is `undefined` in templates.


## Filters

Filters come from three sources, resolved in order so later sources win on
name collision: **built-ins**, **auto-mirrored**, then **overrides**.

1. **Built-ins.** Browser-safe reimplementations of common Eleventy built-ins:
   `slugify`/`slug`, `url`, the date filters, `getNewestCollectionItemDate`,
   the four collection-item filters, and `log`. `inputPathToUrl` is backed by
   the build-time page map (`liquid.pageMap`), so it resolves the correct URL
   for any file in the last build, including computed permalinks. `renderContent`
   is a real shim (see "RenderPlugin shims"). Filters that depend on
   build-time-only state we don't model (`htmlBaseUrl`, `serverlessUrl`) are
   warn-once pass-throughs that return their input unchanged.

2. **Auto-mirrored from your Eleventy config.** The bundle imports your real
   config and replays it in the browser, capturing every `addFilter` /
   `addAsyncFilter` / `addLiquidFilter` call. Because the config is bundled
   (not serialized), each function keeps its closures and imports. A filter
   that depends on Eleventy build-time state (`this.ctx`) or calls a Node API
   at render time will throw when invoked in the browser — the signal to add
   an override.

3. **Overrides** (`pluginOptions.liquid.filters`). A map from filter name to
   module path. Two reasons to use this:
   - **A mirrored filter throws at render time** — supply a browser-safe
     replacement here.
   - **You're overriding a built-in name.** The auto-mirror skips built-in
     names to protect our browser ports, so an
     `eleventyConfig.addFilter("url", …)` won't reach live editing unless you
     also register it here.

### Adding a custom filter

For most filters you don't need to do anything — registering with Eleventy
the normal way is enough; the auto-mirror picks it up.

```js
// eleventy.config.mjs
eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());
// → available in live editing as `{{ "hi" | shout }}` automatically
```

If your filter touches `this.ctx`, `process`, `require`, `__dirname`, or a
closed-over Node module, the auto-mirror will ship it but it'll throw at
render time in the browser. Surface the actionable path by adding an
override:

```js
// eleventy.config.mjs
import { readFileSync } from "node:fs";
eleventyConfig.addFilter("siteConfig", (key) => {
  // Reads from disk — fine server-side, throws in the browser.
  return JSON.parse(readFileSync("./site-config.json", "utf8"))[key];
});

eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    filters: {
      siteConfig: "./live-editing-overrides/site-config.mjs",
    },
  },
});
```

```js
// live-editing-overrides/site-config.mjs
import config from "../site-config.json"; // esbuild inlines this at build time
export default function siteConfig(key) {
  return config[key];
}
```

The override module's default export is registered against the live-editing
engine in place of the original. The Eleventy server-side filter is
untouched.

> Aside: if you have an existing filter that returns the current page's URL
> via `this.page.url`, your template can use the `page` global directly
> instead — `{{ page.url }}` works server-side and in the editor. Avoid
> writing a browser-side override that reads `location.pathname`; inside
> CloudCannon's Visual Editor that returns CC's editor-shell URL, not the site URL.

### Overriding a built-in

If you replace a built-in name in your Eleventy config —
`eleventyConfig.addFilter("url", myCustomUrl)` — your replacement applies
server-side, but the live-editing bundle still uses our handwritten port
(the auto-mirror skips built-in names). To make the override apply in the
bundle too, register a second time via `pluginOptions.liquid.filters`:

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

It's a tax, and it only applies to built-in names. The alternative —
letting the auto-mirror ship Eleventy's defaults — breaks every project
that uses `{{ x | url }}` without overriding, because Eleventy's default
`url` filter closes over Node-only imports that throw in the browser. The
skip protects users who don't override; the second registration unlocks the
path for users who do.

## Shortcodes and paired shortcodes

Same built-ins / auto-mirrored / overrides model as filters. Each
registered function is wrapped via `createShortcodeTag` /
`createPairedShortcodeTag` (see `shortcodes.mjs`) which translates
Eleventy's "function returning a string" shape into LiquidJS's
`{ parse, render }` tag shape.

The only built-in shortcode is `renderFile`. It's one of three RenderPlugin
pieces we shim — the other two land in different sections because they're
different shapes: `renderContent` is a [filter](#filters) and
`renderTemplate` is a [tag](#built-in-tags). See
[RenderPlugin shims](#renderplugin-shims) for the unified view of all
three.

The auto-mirror replays everything the user registered via `addShortcode` /
`addAsyncShortcode` / `addLiquidShortcode` (and the paired equivalents),
closures intact. Overrides live under `pluginOptions.liquid.shortcodes` /
`pluginOptions.liquid.pairedShortcodes` for browser-friendly replacements.

Like filters, the auto-mirror has no portability heuristic — non-portable
shortcodes throw at render time and direct you to add an override.

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

Same auto-mirror + override model as filters and shortcodes. A tag
registered with `addLiquidTag` is replayed from the bundled config, so the
factory and everything it closes over — including LiquidJS internals like
`Tokenizer` / `evalToken` / `toPromise` — survive into the browser with no
extra work:

```js
// eleventy.config.mjs
eleventyConfig.addLiquidTag("echo", echoTagFactory);
// → `{% echo %}` works in live editing automatically
```

The factory is the value `addLiquidTag` expects:
`(liquidEngine) => ({ parse, render })`.

Override only a tag that can't run in the browser as written, via
`pluginOptions.liquid.tags` (tag name → module path, default-exporting the
same factory shape). The override's name is skipped by the auto-mirror so
the override is the sole registration:

```js
liquid: {
  tags: {
    myTag: "./src/live-editing/my-tag.mjs",
  },
}
```

If a template references an unregistered tag, `enhanceLiquidError` rewrites
LiquidJS's "tag X not found" into an actionable message pointing the user at
`pluginOptions.liquid.tags`.

### Built-in tags

The runtime registers a few tags of its own at engine creation time. Users
don't have to do anything to get these.

**`includeWith`** — spreads an object into an include the way Astro's
`{...props}` does. Wired up in both the Eleventy build (so server-rendered
output works) and `createSharedLiquidEngine` (so live editing matches).
Pass a variable that references the object you want to spread — front
matter, an `assign`-ed name, or a global like `page`:

```liquid
{% includeWith "components/card", cardProps %}
```

The second argument must be a variable reference; inline object literals
(`{ key: value }`) aren't standard Liquid syntax and aren't supported.

**`renderTemplate`** — RenderPlugin shim. A paired tag that compiles the
body as a Liquid template and renders it against the supplied data. Same
constraint as `includeWith`: the data argument must be a variable
reference.

```liquid
{% renderTemplate "liquid", templateData %}
  Hello {{ name }}
{% endrenderTemplate %}
```

Only `"liquid"` and `"html"` engines are supported in the browser (other
engines warn once and return the body unchanged). See `eleventy/browser/liquid-render.mjs`.

`renderFile` and `renderContent` are also part of the RenderPlugin shim —
documented in the next section since they're shortcode/filter rather than
tag-shaped.

### RenderPlugin shims

Eleventy's `RenderPlugin` registers three template-side helpers. We
reimplement all three in the browser, scoped to the engines we actually
run there.

> **Server-side note:** 11ty 3.x ships `RenderPlugin` but doesn't auto-load
> it. If you want the helpers to work in your Eleventy build (in addition
> to live editing), explicitly add it in `eleventy.config.mjs`:
>
> ```js
> import { EleventyRenderPlugin } from "@11ty/eleventy";
> eleventyConfig.addPlugin(EleventyRenderPlugin);
> ```
>
> Our browser-side shims work either way.


| Helper | Shape | Usage |
| --- | --- | --- |
| `renderTemplate` | paired Liquid tag | `{% renderTemplate "liquid", data %}…{% endrenderTemplate %}` |
| `renderFile` | async shortcode | `{% renderFile "path/to/file.liquid", data %}` |
| `renderContent` | async filter | `{{ rawString \| renderContent: "liquid", data }}` |

All three share the same behaviour: `"liquid"` (or unspecified) → real
parse-and-render through the shared engine; `"html"` → identity
passthrough; any other engine → warn-once and return the body unchanged.
`renderFile` fetches the target via the CloudCannon Visual Editor API
(`CloudCannon.file(path).content.get()`), which returns the file body with
front matter stripped — matching how Eleventy feeds a template body to its
engine. Any file the editor can see is reachable, not just files inside a
configured `componentDir`. (`{% include %}` is the separate path: it goes
through LiquidJS's filesystem, which is the build-time `cc_liquid_files` map.)

## Component resolution

Components are accessed as `window.cc_components[name](props)`. There are
two resolution paths; the proxy is the primary one and the explicit map is
the override.

1. **Include-resolution proxy** (the primary path). For any unrecognised name,
   the proxy returns a renderer that runs `{% include "<name>" %}` against the
   shared engine, which resolves the file via the configured component
   directories and `extensions`. This is how every auto-discovered component
   becomes reachable with no explicit registration.
2. **Explicit registrations** via `pluginOptions.liquid.components` — a map of
   `name -> module path`. The module's default export is treated as Liquid
   template source for that name, taking precedence over include resolution.
   Use this to substitute a different template for a specific name.

Both paths render to a detached `<div>` and return it as an `HTMLElement`.

## Virtual filesystem

At runtime there are two distinct data sources, and they're not
interchangeable:

- **`window.cc_liquid_files`** — a build-time snapshot of every template under
  the configured component dirs (extensions configurable via
  `liquid.extensions`). Synchronous, source-text only. Backs `{% include %}`
  resolution.
- **CloudCannon Visual Editor API** (`CloudCannon.currentFile()`,
  `CloudCannon.file(path)`, `CloudCannon.collection(key)`, etc.) — a live view
  of the editor's file tree, including pages, data files, drafts, and anything
  added during a session. Backs the `page` and `collections` globals and the
  `renderFile` shortcode.

When in doubt, prefer the API: it sees everything the editor sees and stays
correct as the user edits. `cc_liquid_files` exists only to serve LiquidJS its
template bytes synchronously during `{% include %}`, which the API can't do.

## Error enhancement

Three categories of LiquidJS error are rewritten into actionable messages with
the component/template name and a concrete next step:

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
| `htmlBaseUrl`, `serverlessUrl` filters | Registered as warn-once pass-throughs; return their input unchanged. `htmlBaseUrl` depends on the configured `pathPrefix` (we don't expose it yet); `serverlessUrl` is a build-time concept with no editor equivalent. | Override via `pluginOptions.liquid.filters` if you have a browser-safe equivalent. Otherwise wrap the template path in `{% if ENV_CLIENT %}` and skip it. |
| `inputPathToUrl` filter when the source file wasn't in the last build, or `liquid.pageMap: false` is set | Falls back to warn-once and returns the input path unchanged. The build-time page map is what makes this filter work; without it (or for files added since the last build), there's no URL to look up. | Re-build to pick up new pages, or enable `pageMap` if you'd opted out. |
| `renderTemplate` / `renderFile` / `renderContent` with a non-Liquid engine arg (e.g. `"njk"`, `"md"`) | Warn-once and return the body unchanged. We only ship LiquidJS in the bundle. | Switch the template to Liquid, or guard the call with `{% if ENV_CLIENT %}` so it only runs at build time. |
| Mirrored filters/shortcodes that touch `this.ctx`, `process`, `require`, `__dirname`, or a closed-over Node import | Auto-mirror ships them verbatim; they throw at render time in the browser. The thrown error is wrapped by `enhanceLiquidError` with the filter/shortcode name. | Add a `pluginOptions.liquid.filters` (or `.shortcodes` / `.pairedShortcodes`) override pointing at a browser-safe replacement. |
| Helpers from auto-loaded 11ty plugins used **inside a component** (e.g. `getBundle` / `getBundleFileUrl` / `renderTransforms` from `@11ty/eleventy-plugin-bundle`) | 11ty 3.x auto-loads several plugins that register universal helpers; the auto-mirror ships them verbatim and they'll throw if invoked from a template the editor re-renders. Layouts and pages aren't affected — the live runtime only renders components. | If you reference one of these in an editable component, add a browser-safe override via `pluginOptions.liquid.shortcodes` / `.filters`. Most users won't hit this because bundle helpers typically live in layouts. |
| User overrides of a **built-in** filter name via `eleventyConfig.addFilter` | The auto-mirror skips built-in names, so the override doesn't reach the bundle — live editing keeps using our handwritten port. | Also register the override in `pluginOptions.liquid.filters`. See "Overriding a built-in". |
| Custom Liquid tags | Not auto-mirrored. Templates referencing an unregistered custom tag will fail with an enhanced "tag X not found" error. | Register every tag you want available via `pluginOptions.liquid.tags`. |
| `page.templateSyntax`, `page.lang` | `undefined`. | If you need them, read from front matter / `_data/` instead, or skip the branch via `ENV_CLIENT`. |
| `page.url` and `collections.x[i].url` with computed permalinks when `liquid.pageMap: false` | With the page map disabled, both fall back to front-matter `permalink` or folder-style default. Computed permalinks (JS config / `eleventyComputed`) aren't visible in that mode. With the default `pageMap: true`, both resolve correctly. | Leave `pageMap` enabled (the default), or set front-matter `permalink:` explicitly. |
| `page.date` from file mtime / git history | `undefined` if not in front matter. | Set `date:` in front matter. |
| `eleventy.env.config`, `eleventy.env.root` | Deliberately omitted (absolute filesystem paths). | Don't reference these from a component. |
| `eleventy.env.runMode`, `eleventy.env.source` | Hardcoded to `"serve"` / `"cli"`. | If you need a "we're in the editor" branch, use `ENV_CLIENT` instead. |
| `pagination`, `eleventy.serverless` | Not exposed. | Pagination is a build-time-only data cascade; serverless was removed upstream. |
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
component-specific renderer via `pluginOptions.liquid.components`:
the module's default export is treated as Liquid template source for that
component name, fully replacing what's on disk.

**When you need data the shims don't have.** Pull from `_data/` (which
becomes the front matter / data cascade and is readable via the
`collections` proxy), or from the CloudCannon JS API directly in a custom
tag or filter override. The Visual Editor exposes `currentFile()`,
`collection(key)`, `dataset(key)`, and `file(path)` — see the existing
`page` proxy in `globals.mjs` for a reference implementation.
