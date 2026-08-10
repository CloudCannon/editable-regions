# Editable Regions: implementation review & the shape of a Hugo integration

A review of the existing editable region implementations (Astro, 11ty, React, Svelte — including the `fix/11ty-follow-up` branch) in the `editable-regions` repo, distilled into a design brief for a Hugo integration. Intended audience: a developer familiar with how Hugo bookshop live editing was built.

## TL;DR

The repo has one framework-agnostic contract, and every integration is just a different way of satisfying it: **emit annotated HTML at build time, and register `window.cc_components[key] = (props) => HTMLElement | Promise<HTMLElement>` in the browser.** Everything else — hydration, CMS data binding, DOM diffing, text/image editors, array reordering, error cards — lives in the shared core and comes for free. The 11ty integration on `fix/11ty-follow-up` is the template-language reference architecture, and a Hugo integration should copy its shape almost exactly, with one big swap (the browser template engine — this is where existing Hugo-bookshop knowledge applies) and one significant simplification (Hugo has no JS config to replay, because users can't define custom template functions — all their "helpers" are partials, which are just template files you can ship).

## The shared core contract

Two layers, cleanly split:

**Build time (SSG's job):** templates emit either custom elements (`<editable-component>`, `<editable-text>`, …) or plain elements with `data-editable="component|array|array-item|text|image|source"`. Data binding is via `data-prop` / `data-prop-<name>` attributes whose values are **source-path strings** (e.g. `title`, `@collections[posts]`, `@file[data/nav.yml].links`), not serialized data — data is fetched live from the CloudCannon visual editor API at runtime. Inline constants use `data-literal*` (JSON). Components additionally need `data-component="<key>"`.

**Browser (integration's job):** a "live-editing" bundle side-effect-imports `internal/components` (starts hydration + a MutationObserver over the whole document) and `internal/styles`, then registers renderers. The renderer contract, from `helpers/cloudcannon.mjs`:

```js
addEditableComponentRenderer(key, (props) => HTMLElement | Promise<HTMLElement>)
// → window.cc_components[key]
```

The core (`nodes/editable-component.ts`) resolves the `data-prop` paths against the CC API, subscribes to `change`/`delete` events, calls the renderer with realized plain data when anything changes, and **DOM-diffs** the returned element's children into the live page (preserving focus, contenteditable state, and nested editables). Async renderers are fully supported and updates are coalesced. Missing/erroring renderers degrade to a visible error card with hints. The integration never touches any of this.

## Review of the four implementations

**React (`integrations/react.mjs`, 32 lines) and Svelte (`integrations/svelte.mjs`, 40 lines)** are trivial by design: `registerReactComponent(key, Component)` wraps the component in a `(props) => HTMLElement` using `createRoot` + `flushSync` (React) or `mount`/legacy constructor + `flushSync` (Svelte 5/4). No build-time half at all — the site author writes the annotated elements in JSX/Svelte themselves and hand-authors the live-editing entry module. These prove how small the contract is.

**Astro (`integrations/astro/`)** is the cleverest and most fragile. A Vite plugin monkey-patches Astro's internal `astro:build` transform so `.astro` files compile in **SSR mode into the client bundle**, and remaps `astro:assets`/`astro:content`/`astro:env/server` to browser shims (content collections are backed by the CC API; images degrade to plain `<img>`). At edit time, `registerAstroComponent` hand-constructs a fake `SSRResult` and runs Astro's real `renderToString` in the browser; nested React/Svelte islands render via a renderer registry with a client-side-render placeholder fallback. It works, but it reaches deep into Astro internals (patching another plugin's transform hook, reconstructing internal SSR state) — expect maintenance cost per Astro major.

**11ty (main)** is a 294-line single file, already superseded. **`fix/11ty-follow-up`** is a complete restructure (~5,100 lines added, 39 commits) and is the version to treat as the pattern. Its architecture:

- **Build time:** an 11ty plugin hooks `eleventy.after`, discovers all `.liquid`/`.html` templates under the includes/input dirs, and esbuild-bundles a single `register-components.js` into the output dir. The bundle embeds: template sources as strings (`window.cc_liquid_files`), a **page map** built from 11ty's build `results` (inputPath → url/outputPath, for permalink resolution), static globals (`eleventy`, `pkg`, user-provided `globals`), and the user's real config module (see next point). Node built-ins and 11ty itself are stubbed with a Proxy that bundles fine but **throws only if actually called** at render time — so arbitrary user configs bundle without modification.
- **Config replay:** rather than `fn.toString()`, the bundle imports the user's actual `eleventy.config.mjs` and replays it against a recording stand-in of `eleventyConfig`, capturing custom filters/shortcodes/tags with their closures intact. Precedence: handwritten built-in ports < auto-mirrored < explicit overrides.
- **Browser time:** one shared liquidjs engine re-renders component templates with `props` plus live `page`/`collections` globals built from the CC API (`CloudCannon.currentFile()`, `CloudCannon.collections()`, cache invalidated on change events). ~30 11ty built-in filters are hand-ported; build-only ones (`htmlBaseUrl`, `serverlessUrl`, non-liquid render engines) are **warn-once pass-through stubs** rather than hard failures; genuinely impossible things throw enhanced, actionable errors ("register it in the filters option…").
- **Annotation:** an `includeWith` tag registered both server-side and in the browser engine, so `{% includeWith "card", cardData %}` renders identically in both halves. Authors wrap it in `<div data-editable="component" data-component="card" data-prop="cardData">`.
- Excellent 590-line design README in `integrations/liquid/`, a test fixture site, and a structural `verify-bundle.mjs` test. This branch is the strongest-engineered integration in the repo.

## The shape of a Hugo implementation

Copy the 11ty follow-up architecture piece by piece. Concretely:

**1. Build-time step → emit one `register-components.js` into `public/`.** Hugo has no JS plugin system, so the `eleventy.after` analogue is a post-build CLI step (an npm bin like `npx @cloudcannon/editable-regions-hugo` run after `hugo`, or wired into CloudCannon's build). It needs to:

- Discover component templates (`layouts/partials/**`, `layouts/_shortcodes/**`, plus configurable dirs — mind Hugo modules/theme mounts, which is the discovery wrinkle 11ty didn't have) and embed their sources as strings, the `window.cc_liquid_files` analogue.
- Embed a **page map**. Hugo permalinks are config- and front-matter-driven and not recomputable in the browser; the cleanest Hugo-native trick is a custom output format that dumps `.Site.Pages` (path → RelPermalink/OutputPath) as JSON during the normal build, which the CLI step then inlines. This backs the `.Permalink`/`ref`/`relref` surface the same way the 11ty page map backs `inputPathToUrl`.
- Embed static globals: site config/params, `hugo` version info, menus, taxonomies' structure — the `eleventy`/`pkg` analogue.

**2. No config replay needed — a real simplification.** 11ty's hardest problem was recovering user JS helpers with closures. Hugo users cannot write custom template functions; their reusable logic is partials and shortcodes, which are template files and ship in the same source snapshot as everything else. The whole `collect-config.mjs` subsystem has no Hugo analogue and just disappears. What replaces it in difficulty is the **built-in function surface**: Hugo ships hundreds of template funcs (`where`, `resources.*`, `transform.*`, `time.*`, …), which is exactly the argument for a real Go-template runtime in the browser rather than hand-porting.

**3. The browser renderer — the one real design decision, and the bookshop-shaped hole.** The core contract is just `(props) => Promise<HTMLElement>`; async is fully supported (Astro and liquid are both async). The integration must render a named Hugo template with `props` as context, in the browser. This is precisely the problem Hugo bookshop live editing already solved (client-side Hugo/Go-template rendering). Whatever that renderer is, it gets wrapped as:

```js
registerHugoComponent("card", async (props) => {
  const html = await hugoEngine.render("partials/card.html", props);
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
});
```

Note the engine only ever renders **component-scoped templates with a plain data context** — never full pages, layouts, or the build pipeline. That materially bounds what the renderer must support.

**4. Annotation helpers.** Hugo needs the `includeWith` equivalent — and it's more natural than in Liquid, because `{{ partial "card.html" .Params.card }}` already passes a single context object, matching the props model 1:1. Ship a helper partial (or documented pattern) that emits the wrapper:

```
<div data-editable="component" data-component="card" data-prop="card">
  {{ partial "card.html" .Params.card }}
</div>
```

plus `editable-text`/`editable-array`/`editable-image` patterns for the other node types. Because server HTML is only the *initial* DOM state, the only invariant is that the partial renders equivalently from the same props in both halves.

**5. Live globals shimming.** The browser render context needs `.Site` / `site` / page context. Follow the 11ty split exactly: static parts baked at build time (config, menus), live parts built per-render from the CC API — current page front matter/content from `CloudCannon.currentFile()`, page collections from `CloudCannon.collections()` with cache invalidation on `change`/`delete`. `hugo.IsServer`-style detection maps to the `ENV_CLIENT` convention for editor-only branches.

**6. Degradation model — adopt wholesale.** Three tiers, exactly as in `errors.mjs`/`liquid-builtins.mjs`: (a) works (pure template funcs, live data), (b) warn-once pass-through for build-only features (`resources.*` image processing, `getJSON`/`resources.GetRemote`, `partialCached` → plain partial), (c) enhanced actionable errors for the rest, with a per-component override escape hatch (`components: { "card": "./overrides/card-live.html" }`) for anything unrenderable live.

**7. Package touchpoints.** A `./hugo` subpath export, `types/hugo.d.ts` (mirror `types/liquid.d.ts`), a `test/integrations/hugo/` fixture site with a `verify-bundle.mjs`-style structural test, and a design README following `integrations/liquid/README.md` — that document's "things that don't work + escape hatches" framing is worth replicating as-is.

### What the developer inherits for free

All node controllers, hydration, the `data-prop` source-path grammar and CC API binding, the `cloudcannon-api` event protocol, DOM diffing/focus preservation, text/image editors, array drag-and-drop, error cards, and styles. The Hugo integration reduces to: **build-time emitter (template snapshot + page map + globals) → browser Hugo-template renderer → annotation partials → graceful-degradation shims.** The renderer in step 3 is the only piece that isn't already patterned in this repo.

### Process note

Base the work on `fix/11ty-follow-up`, not main — main's `eleventy.mjs` is the old architecture and the branch also touches shared files (`helpers/cloudcannon.mjs`, astro fixes), so landing it first avoids building Hugo against a moving target.
