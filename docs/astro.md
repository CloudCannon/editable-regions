# Astro integration

The Astro integration lets you live edit Astro components, including components that nest React, Svelte, or Vue components.

## Table of contents

- [Adding the plugin to your config](#adding-the-plugin-to-your-config)
- [Registering components](#registering-components)
- [Framework renderers](#framework-renderers)
- [Collections with `astro:content`](#collections-with-astrocontent)
- [Images with `astro:assets`](#images-with-astroassets)
- [Env vars with `astro:env`](#env-vars-with-astroenv)
- [Other `astro:` modules](#other-astro-modules)
- [Visual editor fallbacks with `ENV_CLIENT`](#visual-editor-fallbacks-with-env_client)
- [Overriding entire components](#overriding-entire-components)
- [Page building](#page-building)

## Adding the plugin to your config

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import editableRegions from "@cloudcannon/editable-regions/astro-integration";

export default defineConfig({
  integrations: [editableRegions()],
});
```

## Registering components

Create a registration script that imports and registers each component that you want to live edit:

```js
// src/scripts/register-components.js
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import CTA from "../components/CTA.astro";

registerAstroComponent("cta", CTA);
```

Load that script from your layout:

```html
<script>
  // Check that the page is loaded in CloudCannon before loading your Editable Components
  if (window.inEditorMode) {
    import("../scripts/register-components.js").catch((error) => {
      console.warn("Failed to load CloudCannon component registration:", error);
    });
  }
</script>
```

Then mark up your templates:

```astro
<editable-component data-component="cta" data-prop="cta">
  <CTA {...cta} />
</editable-component>
```

## Framework renderers

If your Astro components contain React, Svelte, or Vue components, import the matching side-effect renderer in the registration script:

```js
import "@cloudcannon/editable-regions/astro-react-renderer";
import "@cloudcannon/editable-regions/astro-svelte-renderer";
import "@cloudcannon/editable-regions/astro-vue-renderer";
```

To use a React, Svelte, or Vue component as a top-level editable component register it with that framework's own integration instead:

```js
import { registerReactComponent } from "@cloudcannon/editable-regions/react";
import CTA from "../components/CTA.jsx";

registerReactComponent("cta", CTA);
```

The framework renderers and the framework integrations can be used together; see [React](../README.md#react), [Svelte](../README.md#svelte), and [Vue](../README.md#vue) for their setup.

## Collections with `astro:content`

You don't need to change how you query content. When a component runs in the editor, imports from `astro:content` resolve to editor-aware implementations that read live data from CloudCannon, including unsaved changes:

```astro
---
import { getCollection } from "astro:content";
const posts = await getCollection("blog");
---
```

| Export | Behaviour in the editor |
| --- | --- |
| `getCollection(collectionKey, filter?)` | Returns entries from the live collection. Entries carry `collection`, `id`, `data`, `slug`, and `body`. |
| `getEntry({ collection, slug?, id? })` or `getEntry(collection, key)` | Resolves a single entry from the live collection. |
| `getEntries(entries)` | Resolves multiple entries; each item takes the same argument shapes as `getEntry`. |
| `getEntryBySlug(collection, slug)` | Equivalent to `getEntry({ collection, slug })`. |
| `render(entry)` | Renders the entry's raw markdown body. Remark transformations and headings are not available in the editor. |
| `defineCollection()`, `reference()` | Config-only APIs, not supported inside editable components — avoid importing your content config in a component file. |

## Images with `astro:assets`

Imports from `astro:assets` keep working inside editable components, but build-time image processing isn't available in the editor:

| Export | Behaviour in the editor |
| --- | --- |
| `Image`, `Picture` | Render a plain `<img>` (wrapped in `<picture>` for `Picture`) with the resolved source. Props pass through, and image imports resolve, but no processing is performed — no transforms, no generated `srcSet`. |
| `getImage(options)` | Resolves `src` and returns a result shape compatible with `Image`/`Picture` — without processing or `srcSet` generation. |
| `inferRemoteSize()` | Not supported in editable components. Logs a warning and resolves to `{}` — use a visual editor fallback instead. |

Use an [image editable region](../README.md#image) on the surrounding markup to make an image's source editable.

## Env vars with `astro:env`

Public env vars declared with `context: "client"` work in editable components as normal.

Secrets can't work in the editor — they must never reach the browser. If an editable component calls `getSecret` from `astro:env/server`, it logs a warning and returns `undefined`. Use [visual editor fallbacks](#visual-editor-fallbacks-with-env_client) to render something else in the editor.

## Other `astro:` modules

Imports from the remaining `astro:` modules — `astro:actions`, `astro:middleware`, `astro:transitions`, `astro:i18n`, and `astro:env/client` — are supported as is. They resolve to Astro's real implementations and work as they do on your built site.

## Visual editor fallbacks with `ENV_CLIENT`

The integration defines a global boolean `ENV_CLIENT`: `true` when your code runs in the editor's renderer, `false` in a normal build. Use it to render an editing fallback for anything that can't run in the editor — server-only data, browser-incompatible dependencies, unmigrated components:

```astro
---
import WeatherWidget from "../components/WeatherWidget.astro";
---
{ENV_CLIENT ? <p>Weather widget preview unavailable in the editor.</p> : <WeatherWidget />}
```

## Overriding entire components

Registering a component under a name that's already in your templates replaces that component in the editor — the build keeps the original:

```js
// src/scripts/register-components.js
import EditorFriendlyCard from "../components/editor-friendly/Card.astro";

registerAstroComponent("card", EditorFriendlyCard);
```

Any region marked `data-component="card"` renders `EditorFriendlyCard` in the editor and the original in the built site. This is useful when a component depends on build-time state that isn't available in the editor, or you want a simplified editing experience for a complex component.

## Page building

Glob-load your block components in the registration script and register each under its name:

```js
// src/scripts/register-components.js
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";

const blocks = import.meta.glob("../components/blocks/*.astro", { eager: true });

for (const [path, module] of Object.entries(blocks)) {
  const name = path.split("/").pop().replace(/\.astro$/, "");
  registerAstroComponent(name, module.default);
}
```

Then do the page loop in your template. Each array item's component is chosen by its `_name`:

```astro
---
// src/pages/index.astro
const blocks = import.meta.glob("../components/blocks/*.astro", { eager: true });
const blockComponents = Object.fromEntries(
  Object.entries(blocks).map(([path, module]) => [
    path.split("/").pop().replace(/\.astro$/, ""),
    module.default,
  ]),
);
const { contentBlocks } = Astro.props;
---
<main
  data-editable="array"
  data-prop="contentBlocks"
  data-id-key="_name"
  data-component-key="_name"
>
  {contentBlocks.map((block) => {
    const Block = blockComponents[block._name];
    return (
      <section data-editable="array-item" data-id={block._name} data-component={block._name}>
        <Block {...block} />
      </section>
    );
  })}
</main>
```

With front matter like:

```yaml
contentBlocks:
  - _name: HeroBlock
    title: We're on a mission
  - _name: StatsBlock
    stats:
      - figure: $200m
        text: Venture capital raised
```

Editors can add any registered block type, reorder blocks, and edit each one's contents. See [Page building](../README.md#page-building) for the full walkthrough of the id and component keys.
