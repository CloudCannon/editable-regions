# Eleventy smoke test

Build-and-assert fixture for the `@cloudcannon/editable-regions` Eleventy
plugin. The package is linked via `file:../../..` so `npm install` here
picks up local source. `npm test` builds the fixture and grep-checks the
generated bundle (`verify-bundle.mjs`); it does not execute the bundle in
a browser environment. Run `npm run build` to produce `_site/` and inspect
the server-side render.

## What's tested

The plugin's responsibilities split into two halves: it generates a
`register-components.js` browser bundle, and it leaves Eleventy's normal
server-side build untouched. Each top-level page in `src/` exercises one
surface in **both halves** at once — the page renders server-side via
Eleventy and loads `/register-components.js` so the browser-side wiring is on the
page too.

**Every test page (except `/location-probe/`) wraps its demo in
`data-editable="component"` so the block re-renders client-side via
`window.cc_components[name](props)`.** That's the load-bearing bit: it's
how we actually exercise our browser ports rather than 11ty's server
filters. Demo inputs are grouped under one front-matter object per page
(e.g. `filtersDemo`, `customTagsDemo`) — editing any of those in CC
re-renders the corresponding component.

| Page | Front-matter key | Surface | What it confirms |
| --- | --- | --- | --- |
| `/filters/` | `filtersDemo` | Auto-mirrored filter (`shout`); a closure-capturing filter (`stamp`); an async filter (`asyncReverse`, `addAsyncFilter`); the genuine non-portable override (`readmeSize`); the `page.url` global; and built-in `slugify` / `slug` / `url` / date filters. | `shout`/`stamp`/`asyncReverse` mirror automatically (closure survives bundling). `readmeSize` shows `—` in the browser (override) vs a byte count server-side. Built-ins render via our ports. |
| `/shortcodes/` | `shortcodesDemo` | `addShortcode("year")` + closure `buildTime`; `addPairedShortcode("highlight")` + closure `box`; async `asyncGreeting` (`addAsyncShortcode`) and `asyncWrap` (`addPairedAsyncShortcode`). | All auto-mirror end to end, closures and async included. Editing the highlight colour/content re-renders. |
| `/custom-tags/` | `customTagsDemo` | `addLiquidTag("echo", ...)` (auto-mirrored from the config, no override needed) and the built-in `includeWith` tag. | Custom tag is wired in both server and browser. `includeWith` spreads `customTagsDemo.cardProps` into the `card` component. |
| `/render-plugin/` | `renderPluginDemo` | RenderPlugin shims: `renderTemplate`, `renderFile`, `renderContent`. | Server-side: 11ty's `EleventyRenderPlugin` (explicitly added in the config). Browser-side: our shims via the component re-render. |
| `/globals/` | `globalsDemo` | `eleventy`, `page`, `pkg`, `collections.posts`, `process.env` globals. The `globalsDemo.note` field is editable to trigger re-renders. | Server-side values are 11ty's. Browser-side values come from the proxies in `integrations/liquid/globals.mjs` plus the static globals registered by `registerEleventyData` / `registerPkg`. |
| `/posts/*` | (post front matter) | `getCollectionItem` / `getPreviousCollectionItem` / `getNextCollectionItem` / `getCollectionItemIndex` via the `post-meta` component. | Editing a post's front matter re-renders the metadata block via the browser ports — exercises our collection-item filters in the positive case. |
| `/unsupported/` | `unsupportedDemo` | `inputPathToUrl` (a default 11ty 3.x filter). | Server-side: real 11ty filter. Browser-side: page-map lookup, or warn-once pass-through on miss. Editing the input path re-runs the lookup. |
| `/location-probe/` | — | Diagnostic-only — surfaces `window.location.*`, `document.referrer`, `window.inEditorMode`, and `window.CloudCannonAPI`. | Used to verify what the browser sees inside CC's Visual Editor. Inline script, no component re-render. |

## What the bundle should contain

`verify-bundle.mjs` is a **structural** smoke test: it checks one thing per
distinct piece of the plugin's *emit contract*, not the individual mirrored
helpers. After `npm run build`, `_site/register-components.js` should contain:

- `createSharedLiquidEngine({...})` + `registerEleventyBuiltins(liquidEngine)`
- `collectAndRegisterEleventyHelpers(config, ...)` — the config-replay call
- proof the real config was **bundled, not serialised**: the module-scope
  `buildInfo` const the helpers close over is present (it would vanish under
  `fn.toString()`)
- the browser-stub body (`"…Node/build-time API was called…"`) — the config
  imports `node:fs` / `@11ty/eleventy`, which must resolve to the stub
- skip handling: builtin ports are skipped inside the collector from a list
  derived from the implementations (single source of truth), while the emitted
  call passes only override names on top. Asserts the collector seeds the
  derived list, the derivation itself, override names passed, mirrored names
  *not* skipped, and all four kind-keys present
- an override register call (`registerFilter("readmeSize", ...)`) and a pinned
  component (`registerLiquidComponent("card", ...)`)
- the static globals — `registerProcessEnv` (allowlist + `PUBLIC_` prefix),
  `registerEleventyData` (`version` + `directories`, `env.runMode: "serve"`),
  `registerPkg` (package.json mirrored verbatim), `registerPageMap` (a
  resolved `url`)
- a `.liquid` template inlined into `window.cc_liquid_files`

What it deliberately does **not** assert: individual mirrored helper names or
bodies (`shout`, `year`, `echo`, the async helpers, …). A body being in the
bundle never proved it *works* — only that esbuild kept it. That those helpers
actually register and render is **runtime** behavior, checked by opening the
fixture in the Visual Editor and watching the demo components re-render (see
the table above). Keep verify-bundle structural; don't re-add per-helper greps.

Helpers registered by plugins the user **explicitly** `addPlugin`s in their
config are mirrored too — the replay calls those plugin functions against
the recording stand-in. But helpers from plugins 11ty **auto-loads** that
the user never adds themselves (in 11ty 3.x that includes
`@11ty/eleventy-plugin-bundle`'s `getBundle` / `getBundleFileUrl` and
`renderTransforms`) are *not* mirrored: the replay only sees the user's
config, not 11ty's internal defaults. If you use one of those auto-loaded
helpers inside an editable component, supply a browser override via
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
  location-probe.liquid     diagnostic — what does the browser see?
  posts/                    collection items for `collections.posts`
    posts.json              tags every sibling .md with "posts", layout: post
    first-post.md
    second-post.md
    third-post.md
  _includes/
    page-shell.liquid           layout used by every page
    post.liquid                 post layout — wraps post-meta in a component
    card.liquid                 component overridden in the browser bundle
    render-target.liquid        file fetched by renderFile
    filters-demo.liquid         per-page demo component (live-edits `filtersDemo`)
    shortcodes-demo.liquid      per-page demo component (live-edits `shortcodesDemo`)
    custom-tags-demo.liquid     per-page demo component (live-edits `customTagsDemo`)
    render-plugin-demo.liquid   per-page demo component (live-edits `renderPluginDemo`)
    globals-demo.liquid         per-page demo component (live-edits `globalsDemo`)
    unsupported-demo.liquid     per-page demo component (live-edits `unsupportedDemo`)
    post-meta.liquid            component used by the post layout for nav/index
overrides/
  echo-tag.mjs              factory for the `echo` Liquid tag
  card-override.mjs         browser-side template source for the `card` component
eleventy.config.mjs         registers everything + wires the plugin
cloudcannon.config.yml      minimal CC config so the fixture is openable in the Visual Editor
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
