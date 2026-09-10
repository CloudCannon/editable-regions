# Eleventy integration

The Eleventy integration is an Eleventy plugin. On every build it walks your templates for components, bundles a client-side Liquid engine with your filters, shortcodes, tags, and include templates, and emits a registration script into your output directory. When a page loads in CloudCannon, that script registers your includes as editable components.

## Table of contents

- [Adding the plugin to your config](#adding-the-plugin-to-your-config)
- [Including the editable regions in your layout](#including-the-editable-regions-in-your-layout)
- [Registering components](#registering-components)
- [Adding the markup](#adding-the-markup)
- [Collections and datasets in components](#collections-and-datasets-in-components)
- [Plugin options](#plugin-options)
  - [`globals`](#globals)
- [Liquid options](#liquid-options)
  - [Alternatives for helpers that can't run in the browser](#alternatives-for-helpers-that-cant-run-in-the-browser)
  - [Stubbing packages out of the browser bundle](#stubbing-packages-out-of-the-browser-bundle)

## Adding the plugin to your config

Add the plugin to `eleventy.config.mjs`:

```js
import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(editableRegions);

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
  };
}
```

On a CommonJS config, use `require` instead:

```js
const editableRegions = require("@cloudcannon/editable-regions/eleventy");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(editableRegions);
  // ...
};
```

## Including the editable regions in your layout

After every build the plugin emits `register-components.js` into your output directory — a bundle containing a client-side Liquid engine, your filters/shortcodes/tags (auto-mirrored from your real Eleventy config), and your include templates. Load it in your layout:

```html
<script>
  // Check that the page is loaded in CloudCannon before loading your Editable Components
  if (window.inEditorMode) {
    import("/register-components.js").catch((error) => {
      console.warn("Failed to load CloudCannon component registration:", error);
    });
  }
</script>
```

## Registering components

There's no registration step: the editor resolves component names the same way your templates resolve includes. A component name is an include name — `{% include "author-card" %}` matches `data-component="author-card"` — rendered against your component directories (see [`componentDirs`](#liquid-options)).

To pin an explicit component name, or register a template outside your component directories, use the `components` option:

```js
eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    components: {
      "author-card": "./src/_includes/people/author-card.liquid",
    },
  },
});
```

Names registered through `components` win over the auto-resolved ones.

## Adding the markup

Wrap each include in an editable component region:

```liquid
<div data-editable="component" data-component="author-card" data-prop-author-name="authorName">
  {% include "author-card", author-name: authorName %}
</div>
```

The `includeWith` tag spreads a props object into an include, pairing with a `data-prop` selector:

```liquid
<div data-editable="component" data-component="post-meta" data-prop="postMeta">
  {% includeWith "post-meta", postMeta %}
</div>
```

## Collections and datasets in components

Include templates rendered in the editor read live content. The `collections` global resolves through CloudCannon so templating that loops over a collection reflects the editor's current state, including unsaved changes:

```liquid
<ul>
  {% for post in collections.posts %}
    <li><a href="{{ post.url }}">{{ post.data.title }}</a></li>
  {% endfor %}
</ul>
```

To point a region's props at a collection or dataset directly, use an `@` reference:

```liquid
<ul data-editable="array" data-prop="@collections[blog]">
  <li data-editable="array-item">
    <h4 data-editable="text" data-prop="title" />
  </li>
</ul>
```

`@collections[blog]` reads the `blog` collection, `@data[nav]` a dataset, `@file[about.md]` another file. See [referencing external data](../README.md#referencing-external-data) for the full list.

## Plugin options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `output` | `string` |  | Output path for the generated bundle, relative to the project root. Defaults to `register-components.js` inside Eleventy's `dir.output`. |
| `verbose` | `boolean` |  | Enable verbose browser logging. |
| `liquid` | `LiquidOptions \| boolean` |  | Liquid is the plugin's default language and is enabled implicitly. Pass `false` to disable, `true` for defaults, or an options object for customisation. |
| `globals` | `Record<string, unknown>` |  | Extra globals exposed to editor-rendered templates, mirroring global data your build provides via `_data/` or `addGlobalData`. Embedded at build time, so values must be JSON-serialisable. Don't include secrets. |

### `globals`

Templates rendered in the editor don't have access to your build's global data unless it is mirrored. Pass the data explicitly:

```js
eleventyConfig.addPlugin(editableRegions, {
  globals: {
    env: { API_BASE: process.env.API_BASE },
  },
});
```

## Liquid options

Liquid is enabled implicitly. Pass `liquid: false` to disable it entirely, or an options object:

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `componentDirs` | `string[]` |  | Directories to walk for component templates. Defaults to `[directories.includes, directories.input]`. |
| `extensions` | `string[]` |  | Template file extensions to bundle. Defaults to `[".liquid", ".html"]`. |
| `ignoreDirectories` | `string[]` |  | Directory names to skip when walking. Defaults to `[directories.output, "node_modules"]`. |
| `components` | `Record<string, string>` |  | Map of component name → module path. Wins over the auto-discovered components. |
| `configPath` | `string` |  | Path to your Eleventy config file, used to auto-mirror its helpers into the browser bundle. Defaults to the first of Eleventy's standard names that exists. Set this only if you run Eleventy with a non-default `--config` path. |
| `browserStub` | `string[]` |  | Extra bare module specifiers to stub out of the browser bundle, on top of the Eleventy toolchain and Node built-ins (always stubbed). |
| `filters` | `Record<string, string>` |  | Browser-side filter overrides: filter name → module path. |
| `shortcodes` | `Record<string, string>` |  | Browser-side shortcode overrides. |
| `pairedShortcodes` | `Record<string, string>` |  | Browser-side paired-shortcode overrides. |
| `tags` | `Record<string, string>` |  | Browser-side custom Liquid tag overrides: tag name → module path exporting a `(engine) => { parse, render }` factory. |

### Alternatives for helpers that can't run in the browser

Your config's filters, shortcodes, paired shortcodes, and custom tags are auto-mirrored into the browser bundle: the plugin bundles your real config file, so closures and imports survive. Helpers built on Liquid and plain JavaScript work in the editor with no extra configuration.

Helpers that depend on Node-only packages can't be mirrored. For those, provide a browser alternative and register it under the same name. The alternative is bundled at build time, replaces the helper in the editor, and its name is excluded from the mirror:

```js
// eleventy.config.mjs — the real filter sharpens images with sharp
import sharp from "sharp";

export default function (eleventyConfig) {
  eleventyConfig.addAsyncFilter("sharpen", (src) => sharp(src).sharpen().toBuffer());
  // ...
}
```

```js
// img/sharpen-browser.js — the editor alternative
export default () => "Image adjustments aren't previewed in the editor";
```

```js
// eleventy.config.mjs
eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    filters: {
      sharpen: "./img/sharpen-browser.js",
    },
  },
});
```

Alternatives are resolved relative to your project root and default-export the helper — for `tags`, the default export is the `(engine) => { parse, render }` tag factory. The same pattern covers `shortcodes`, `pairedShortcodes`, and `tags`.

### Stubbing packages out of the browser bundle

The mirrored config runs in a browser, so Node built-ins and the Eleventy toolchain are always stubbed. A native or Node-only package that would otherwise break bundling (e.g. `sharp`) needs an explicit stub:

```js
eleventyConfig.addPlugin(editableRegions, {
  liquid: {
    browserStub: ["sharp"],
  },
});
```

`browserStub` also covers a Node-only package your config *calls* at config time — for example a plugin factory in `addPlugin(pluginFactory({ ... }))`. The argument is evaluated before `addPlugin` is reached, so stubbing the module is the only way to stop it aborting the mirror.

A stubbed module called while the mirror runs is skipped with a warning; the same call from a rendered helper still throws.
