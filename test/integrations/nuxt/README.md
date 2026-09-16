# nuxt-editables — a Nuxt harness for `@cloudcannon/editable-regions` (Vue)

A deliberately ugly Nuxt 4 site whose only job is to exercise the Vue integration of
`@cloudcannon/editable-regions` (imported from this monorepo via `file:../../..`) inside a real
CloudCannon Visual Editor.

Ported from the reference harness at `tomrcc/vue-test`, with the pages routed through the package's
`EditableRegions` root component (rendered once in `app/layouts/default.vue`).

One page per region type, so a failure is easy to attribute — plus one composed page that does the
opposite on purpose.

## Two kinds of page

**The matrix** (`/text/`, `/image/`, `/array/`, `/data/`, `/component/`, `/page-builder/`, `/source/`)
isolates one region type each. When something breaks, the page it breaks on names the cause. That is how
the array-item hydration bug was pinned in minutes: it appeared on `/array/` and nowhere else.

**`/landing/`** is composed like a real product page and exists to catch what isolation cannot: bugs that
only appear when features interact. On one page it puts five adjacent component regions, arrays nested
inside arrays inside components (six levels deep), conditionals and derived content inside nested rows,
`<details>` elements carrying UI state across re-renders, and frontmatter, a data file and `@content` all
at once. 72 text regions, 15 arrays, 45 array items.

The two are complementary: the matrix tells you *what* broke, `/landing/` tells you *whether it survives
company*.

## Why a harness and not a demo site

The Vue integration (`integrations/vue.mjs`, `registerVueComponent`) is currently covered by unit tests
and by Vue components rendered *inside* an Astro site. Nothing tested it in a first-class Vue site. This
repo is that test.

## Running it

```bash
npm install      # installs editable-regions from this monorepo via file:../../..
npm run generate # → .output/public
```

**Editable regions are invisible locally.** The site ships no editable-regions JavaScript — CloudCannon's
Visual Editor injects the runtime. The npm dependency exists only to provide `registerVueComponent`. All
visual verification happens on CloudCannon.

## Layout

| Path                                  | What it is                                                          |
| ------------------------------------- | --------------------------------------------------------------------- |
| `content/pages/*.md`                  | The `pages` collection — one file per test page, `url: /[slug]/`    |
| `data/{nav,cta,footer}.json`          | Shared partials, reached via `@data[key]`                           |
| `app/pages/source.vue`                | The source-editable page — its own single-file collection          |
| `app/cloudcannon/componentMap.ts`     | Single source of truth: `data-component` key → Vue component        |
| `app/cloudcannon/registerComponents.ts` | Loops the map through `registerVueComponent`                      |
| `app/plugins/cloudcannon.client.ts`   | Loads the above only when `window.inEditorMode`                     |

## Nuxt/Vue-specific findings

Things that needed a Vue-shaped answer rather than the Astro one. These are candidates for the
`cloudcannon-visual-editing` skill.

1. **`isCustomElement` is mandatory.** Without
   `vue.compilerOptions.isCustomElement: (tag) => tag.startsWith("editable-")` in `nuxt.config.ts`, Vue
   tries to resolve `<editable-text>` and friends as components and warns on every render.

2. **`<template>` array blueprints need `innerHTML`, not children.** Two Vue constraints stack up, and
   getting the second wrong breaks the page loudly. See § `<template>` blueprints in Vue.

3. **Frontmatter parsing must be browser-safe.** The parsed content is bundled for hydration, so
   `gray-matter` (which needs Node's `Buffer`) is out. `app/utils/content.ts` splits the `---` block by
   hand and parses it with `js-yaml`.

4. **Vue's `v-for` fragment anchors are harmless.** `<!--[-->` / `<!--]-->` land as direct children of
   array containers, but `EditableArray` reads `element.children` and `querySelectorAll`, both of which
   skip comment nodes.

5. **`ssg` is `nuxtjs`, not `nuxt`.** Confirmed against the initial-site-settings schema enum.

6. **The skill docs are stale on Vue.** `cloudcannon-visual-editing/astro/visual-editing-reference.md`
   currently says Vue components "will always error in editable regions and must be converted or given
   editing fallbacks". This branch makes that untrue.

## Test matrix

Fill in the Result column from the CloudCannon Visual Editor. Build-time status is what `npm run generate`
plus a grep of `.output/public` confirms; it says nothing about editor behaviour.

| Page             | What it tests                                          | Build | Result |
| ---------------- | -------------------------------------------------------- | ----- | ------ |
| `/text/`         | `data-type` span / text / block                        | ✅    |        |
| `/text/`         | `data-prop="@content"` markdown body                   | ✅    |        |
| `/image/`        | Region host on the `<img>` itself                      | ✅    |        |
| `/image/`        | `<editable-image>` wrapper around an `<img>`           | ✅    |        |
| `/image/`        | Whole-object binding via a single `data-prop`          | ✅    |        |
| `/array/`        | Object array, nested text + image per row              | ✅    |        |
| `/array/`        | String array via `data-prop=""` pass-through           | ✅    |        |
| `/array/`        | "Add item" clones the first row (non-empty arrays)     | ✅    |        |
| `/array/`        | `<template>` blueprint on an **empty** array           | ✅    |        |
| `/data/`         | `@data[nav].items` flat array                          | ✅    |        |
| `/data/`         | `@data[footer].columns` with a nested array            | ✅    |        |
| `/data/`         | `@data[cta]` on a registered component                 | ✅    |        |
| `/component/`    | Static component re-render                             | ✅    |        |
| `/component/`    | Conditional / class-bound / derived content            | ✅    |        |
| `/component/`    | Stateful component across a re-render                  | ✅    |        |
| `/page-builder/` | `data-component-key` + per-row `data-component`        | ✅    |        |
| `/page-builder/` | Block add / delete / reorder                           | ✅    |        |
| `/page-builder/` | Sub-array inside a block                               | ✅    |        |
| `/source/`       | Source region round-trip through a `.vue` file         | ✅    |        |
| All pages        | Header nav + footer columns from data files            | ✅    |        |
| `/landing/`      | Five adjacent component regions on one page            | ✅    |        |
| `/landing/`      | Array inside array inside component (6 levels)         | ✅    |        |
| `/landing/`      | Conditional badge + class binding inside nested rows   | ✅    |        |
| `/landing/`      | Derived summary updates when a nested row changes      | ✅    |        |
| `/landing/`      | `<details>` open state survives a component re-render  | ✅    |        |
| `/landing/`      | Frontmatter + `@data[cta]` + `@content` on one page    | ✅    |        |

## `<template>` blueprints in Vue

The sharpest finding in this repo, and the one most worth pushing back into the skill.

**Constraint 1 — the element can't be written inline.** A literal `<template>` in an SFC is consumed by
the Vue compiler as a fragment wrapper and never reaches the DOM. It has to come from a render function.

**Constraint 2 — its content must be an `innerHTML` prop, not children.** This is the non-obvious one.
The first attempt was:

```ts
render: () => h("template", null, slots.default?.())   // ✗ breaks at hydration
```

That produced correct, well-formed HTML in the prerendered output, and still broke in the Visual Editor:
every array on the page filled with *"Failed to render array item — this element has no parent editable
region"* cards.

Why: only the **HTML parser** redirects a template's contents into its `.content` fragment — the DOM API
does not. So a parsed `<template>` always has `firstChild === null`. Vue hydrating a vnode *with
children* walks `el.firstChild`, finds nothing, calls it a mismatch, and client-renders the children
into `childNodes`. Blueprint content ends up visible to `querySelectorAll` (so it hydrates as real array
items, orphaned from their array) while `.content` — where `EditableArray` looks — stays empty. Both
assumptions inverted at once.

The fix is to give the vnode no children at all:

```ts
render: () => h("template", { innerHTML: props.html })  // ✓
```

Vue skips child hydration entirely when a vnode has an `innerHTML` prop — `runtime-core`
`hydrateElement`: `shapeFlag & 16 && !(props.innerHTML || props.textContent)`. Nothing to walk, nothing
to mismatch. And setting `.innerHTML` on a template element routes content into `.content`, per spec.

Cost: blueprints are authored as HTML strings (see `app/pages/array.vue`) rather than Vue markup.

**Verified:** parsing the built `/array/` page confirms three templates, each with exactly one
`array-item` root inside `.content` and its nested regions intact, and blueprint content invisible to a
document-level `querySelectorAll`. The hydration half is verified by reading Vue's source, not observed
in a browser — the remaining risk is there.

**Question for upstream:** should `EditableArray` also accept a template's direct `childNodes` as a
blueprint? That would make it robust for any framework that builds templates via the DOM API rather than
the parser, instead of every such framework having to discover this independently.

### Open questions for the Visual Editor pass

- Does a `registerVueComponent` re-render survive Nuxt's hydrated DOM, or does Vue patch back over it?
- `registerVueComponent` builds a fresh `createApp` per re-render. `/component/`'s stateful counter should
  reset its count — confirm that, and check whether the discarded app leaves listeners behind.
- Does array CRUD stay aligned with Vue's `v-for` fragment anchors after add / delete / reorder?
- Does a source-editable splice survive a `.vue` SFC, given the file is not plain HTML?

## Build-time verification

```bash
npm run generate
find .output/public -name '*.html' -exec grep -ohE 'data-editable="[a-z-]+"' {} + | sort | uniq -c
npx @cloudcannon/cli validate
```

Use match counts (`grep -o | wc -l`), not line counts — prerendered HTML is one line per page.
