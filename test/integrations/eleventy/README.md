# Eleventy smoke test

Build-and-assert fixture for the `@cloudcannon/editable-regions` Eleventy
plugin. The package is linked via `file:../../..` so `npm install` here
picks up local source. `npm test` builds the fixture and grep-checks the
generated bundle (`verify-bundle.mjs`); it does not execute the bundle in
a browser environment. Run `npm run build` to produce `_site/` and inspect
the server-side render.

## What's tested

The plugin's responsibilities split into two halves: it generates a
`live-editing.js` browser bundle, and it leaves Eleventy's normal
server-side build untouched. Each top-level page in `src/` exercises one
surface in **both halves** at once — the page renders server-side via
Eleventy and loads `/live-editing.js` so the browser-side wiring is on the
page too.

| Page | Surface | What it confirms |
| --- | --- | --- |
| `/filters/` | Auto-mirrored filters (`shout`, `currentPageUrl`), browser-side override (`currentPageUrl`), and the built-in date/slug filters. | `shout` mirrors automatically. `currentPageUrl` ships as-is via auto-mirror but is shadowed by the override module in the browser. Built-ins (`slugify`, `dateToRfc*`, `htmlDateString`) render. |
| `/shortcodes/` | `addShortcode("year")`, `addPairedShortcode("highlight")`. | Both surfaces auto-mirror end to end. |
| `/custom-tags/` | `addLiquidTag("echo", ...)` + `pluginOptions.liquid.tags`, and the built-in `includeWith` tag. | Custom tag is wired in both server and browser. `includeWith` spreads front-matter data into the `card` component. |
| `/render-plugin/` | RenderPlugin shims: `renderTemplate`, `renderFile`, `renderContent`. | Server-side render is provided by 11ty's `EleventyRenderPlugin` (explicitly added in the config); browser-side render is provided by our shims. |
| `/globals/` | `eleventy`, `page`, `collections.posts`, `process.env` globals. | Server-side values are 11ty's; browser-side values come from the proxies in `integrations/liquid/globals.mjs`. |
| `/posts/*` | `getCollectionItem` / `getPreviousCollectionItem` / `getNextCollectionItem` / `getCollectionItemIndex` against `page` — the positive case where the current page _is_ in the collection. | Each post page renders the `post` layout, which calls the four filters against `page`; values should resolve to neighbouring items, not the empty fallback. |
| `/unsupported/` | Warn-once stub filters (`inputPathToUrl`). | Server-side: real 11ty filter. Browser-side: warn-once pass-through. |

## What the bundle should contain

After `npm run build`, `_site/live-editing.js` should include:

- `createSharedLiquidEngine({...})` and `registerEleventyBuiltins(liquidEngine)` calls
- `registerFilter("shout", ...)` — auto-mirrored
- `registerFilter("currentPageUrl", ...)` — from the override module path
- `registerShortcode("year", ...)` + `registerPairedShortcode("highlight", ...)` — auto-mirrored
- `registerCustomTag("echo", ...)` — from the tag override module path
- `registerLiquidComponent("card", ...)` — from the `pluginOptions.liquid.components` map
- `registerProcessEnv({...})` — env allowlist + `PUBLIC_` prefix
- `registerEleventyData({...})` — `version`, `generator`, `env.runMode` (`"serve"`), `directories`
- `window.cc_liquid_files[...]` entries for every Liquid template under `src/_includes/` and `src/`

These expectations are encoded in `verify-bundle.mjs`; run `npm test` to
build the fixture (with sample env vars set) and assert against the
generated bundle.

The bundle will also pick up universal helpers from any 11ty plugins
auto-loaded into the user config (in 11ty 3.x, that includes
`@11ty/eleventy-plugin-bundle`'s `getBundle` / `getBundleFileUrl` and
`renderTransforms`). Those mirror verbatim; if you use them inside an
editable component, supply an override via
`pluginOptions.liquid.shortcodes` / `.filters`. Layouts and pages aren't
affected.

## Layout

```
src/
  index.liquid              nav to each surface page
  filters.liquid
  shortcodes.liquid
  custom-tags.liquid
  render-plugin.liquid
  globals.liquid
  unsupported.liquid
  posts/                    collection items for `collections.posts`
    posts.json              tags every sibling .md with "posts", layout: post
    first-post.md
    second-post.md
    third-post.md
  _includes/
    page-shell.liquid       layout used by every page
    post.liquid             post layout — exercises collection-item filters
    card.liquid             component overridden in the browser bundle
    render-target.liquid    file fetched by renderFile
overrides/
  current-page-url.mjs      browser-side filter for `currentPageUrl`
  echo-tag.mjs              factory for the `echo` Liquid tag
  card-override.mjs         browser-side template source for the `card` component
eleventy.config.mjs         registers everything + wires the plugin
```

## Running

```sh
npm install
npm run build      # builds once into _site/
npm run dev        # eleventy --serve, watches for changes
npm test           # builds with sample env vars + asserts the bundle
```

Open `_site/index.html` (or `http://localhost:8080/` during `--serve`) and
click through the pages to inspect server-side output. The browser-side
bundle is wired up on every page but only takes over when loaded inside
the CloudCannon Visual Editor.
