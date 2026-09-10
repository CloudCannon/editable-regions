# Editable Regions

Visual Editing for the [CloudCannon](https://cloudcannon.com/) CMS.

[<img src="https://img.shields.io/npm/v/@cloudcannon%2Feditable-regions?logo=npm" alt="version badge">](https://www.npmjs.com/package/@cloudcannon%2Feditable-regions)

Editable Regions let you mark up any HTML output with attributes (or web components) that tell CloudCannon's Visual Editor exactly what is editable: text, images, arrays, components, and hard-coded source markup. Edits re-render the preview live and write your changes back to your structured data or source files.

## Table of contents

- [Installation](#installation)
- [Quickstart](#quickstart)
  - [Astro](#astro)
  - [Eleventy](#eleventy)
  - [Hugo](#hugo)
  - [React](#react)
  - [Svelte](#svelte)
  - [Vue](#vue)
- [How editable regions work](#how-editable-regions-work)
  - [Defining editable regions](#defining-editable-regions)
  - [Passing values to editable regions](#passing-values-to-editable-regions)
- [Value regions](#value-regions)
  - [Text](#text)
  - [Image](#image)
- [Structural regions](#structural-regions)
  - [Components](#components)
  - [Arrays and array items](#arrays-and-array-items)
  - [How prop selectors compose](#how-prop-selectors-compose)
- [Page building](#page-building)
- [Referencing external data](#referencing-external-data)
- [Literal props](#literal-props)
- [Source regions](#source-regions)
  - [How they work](#how-they-work)
  - [Limitations](#limitations)
  - [When to use them](#when-to-use-them)
  - [Options](#options-4)

For integration-specific setup and options checkout the dedicated docs pages:

- [Astro](docs/astro.md)
- [Eleventy](docs/eleventy.md).
- [Hugo](docs/hugo.md).

## Installation

Install the package from npm:

```sh
npm install @cloudcannon/editable-regions
```

## Quickstart

### Astro

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import editableRegions from "@cloudcannon/editable-regions/astro-integration";

export default defineConfig({
  integrations: [editableRegions()],
});
```

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

If your Astro components contain React, Svelte, or Vue components, add the matching side-effect renderer import to the same registration file:

```js
import "@cloudcannon/editable-regions/astro-react-renderer";
import "@cloudcannon/editable-regions/astro-svelte-renderer";
import "@cloudcannon/editable-regions/astro-vue-renderer";
```

Then mark up your templates:

```astro
<h1 data-editable="text" data-prop="title">{title}</h1>
<editable-component data-component="cta" data-prop="cta">
  <CTA {...cta} />
</editable-component>
```

### Eleventy

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

On a CommonJS config, use require instead (needs Node 20.19+, the oldest release that can `require()` this package):

```js
const editableRegions = require("@cloudcannon/editable-regions/eleventy");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(editableRegions);

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
  };
};
```

After every build, the plugin emits `register-components.js` into your output directory, a bundle containing a client-side Liquid engine, your filters/shortcodes/tags (auto-mirrored from your real Eleventy config), and your include templates. Load it in your layout:

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

The plugin automatically registers your Liquid includes as components.

```liquid
<div data-editable="component" data-component="author-card" data-prop-author-name="authorName">
  {% include "author-card", author-name: authorName %}
</div>
```

The plugin also registers an `includeWith` tag for spreading a props object into an include:

```liquid
<div data-editable="component" data-component="post-meta" data-prop="postMeta">
  {% includeWith "post-meta", postMeta %}
</div>
```

### Hugo

Install the package as a Hugo module:

```toml
# hugo.toml
[module]
  [[module.imports]]
    path = "github.com/CloudCannon/editable-regions"
```

Include the partial in your site `<head>`:

```html
{{ partial "editable-regions" . }}
```

The module automatically registers your Hugo partials as components.

```html
<div data-editable="component" data-component="card.html" data-prop="card">
  {{- partial "card.html" .Params.card -}}
</div>
```

### React

For a standalone React SPA, register your components from your client entry point:

```js
// src/index.js
import { registerReactComponent } from "@cloudcannon/editable-regions/react";
import CTA from "./components/CTA.jsx";

registerReactComponent("cta", CTA);
```

Then mark up your templates:

```jsx
<editable-component data-component="cta" data-prop="cta">
  <CTA {...props.cta} />
</editable-component>
```

### Svelte

For a standalone Svelte SPA, register your components from your client entry point:

```js
// src/index.js
import { registerSvelteComponent } from "@cloudcannon/editable-regions/svelte";
import CTA from "./components/CTA.svelte";

registerSvelteComponent("cta", CTA);
```

Then mark up your templates:

```svelte
<editable-component data-component="cta" data-prop="cta">
  <CTA {...cta} />
</editable-component>
```

### Vue

For a standalone Vue SPA, register your components from your client entry point:

```js
// src/index.js
import { registerVueComponent } from "@cloudcannon/editable-regions/vue";
import CTA from "./components/CTA.vue";

registerVueComponent("cta", CTA);
```

Then mark up your templates:

```vue
<editable-component data-component="cta" data-prop="cta">
  <CTA v-bind="cta" />
</editable-component>
```

## How editable regions work

An editable region is a piece of your page that the Visual Editor can edit in place. When your page is loaded in the Visual Editor, CloudCannon hydrates your elements into editable regions. Outside of CloudCannon your elements are plain HTML; your users see exactly the markup you authored.

The Editable Regions can edit any structured data configured in your CloudCannon site, including your page front matter and content, your datasets, and your collections.

### Defining editable regions

You define one by adding an HTML attribute to an existing element, or by wrapping content in the equivalent web component:

| Attribute | Web component |
| --- | --- |
| `data-editable="text"` | `<editable-text>` |
| `data-editable="image"` | `<editable-image>` |
| `data-editable="source"` | `<editable-source>` |
| `data-editable="array"` | `<editable-array>` |
| `data-editable="array-item"` | `<editable-array-item>` |
| `data-editable="component"` | `<editable-component>` |

The two forms are equivalent. Data attributes are useful when you are attaching editable regions to existing markup, whereas the web components are useful when there isn't existing markup to attach an attribute to or you don't have direct access to the markup.

```astro
<h1 data-editable="text" data-prop="title">{title}</h1>

<editable-image data-prop-src="src">
    <MyFigureComponent src={src} />
</editable-image>
```

### Passing values to editable regions

Every editable region receives the value it edits through a `data-prop` selector. Selectors point into your data, relative to the root of the current file (typically its front matter) or the [nearest editable ancestor](#how-prop-selectors-compose). The region resolves the selector and re-renders as that value changes; edits write back through the same selector.

```astro
<h4 data-editable="text" data-prop="name">{testimonial.name}</h4>
```

Regions can also receive multiple named values with `data-prop-*` attributes. The attribute suffix is the name the value is passed under, and the attribute value is a second selector:

```astro
<img
  data-editable="image"
  data-prop-src="heroImage"
  data-prop-alt="heroImageAlt"
/>
```

Here the image region receives two values: `src` selected from `heroImage`, and `alt` selected from `heroImageAlt`. The names and types of values each region expects are listed in its Options section below.

## Value regions

Value regions edit a single value. They are the leaves of your page and don't allow any other editable regions to nest within them.

### Text

Add `data-editable="text"` and a `data-prop` naming the structured data key to edit:

```astro
<h4 data-editable="text" data-prop="name">{testimonial.name}</h4>
```

Or use the `editable-text` web component:

```astro
<h4><editable-text data-prop="name">{testimonial.name}</editable-text></h4>
```

#### Editing file content

If the element you want to edit is the file's body content (Markdown/HTML content rather than a front matter key) you can use the special `@content` syntax (See [Referencing external data](#referencing-external-data) for more information).

```astro
<div data-editable="text" data-prop="@content">
    <Content />
</div>
```

By default `@content` refers to the content of the current page. If you want to reference another page's content you can combine it with another external data selector like `@file`.

```astro
<div data-editable="text" data-prop="@file[README.md].@content">
    <Content />
</div>
```

#### Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-prop` | Selector<string> | Yes | The data to edit, selected value must be a string. |
| `data-type` | `"span"` \| `"text"` \| `"block"` | No | Controls the editing surface: `span` edits plain text, `text` edits paragraph-level rich text, and `block` edits multi-paragraph rich text. |
| `data-defer-mount` | Boolean | No | When set, the editor only initializes the region the first time it is clicked, instead of on page load. Defaults to `false`. |

The `data-type` default is calculated from the value being edited: regions editing rich text — source regions, `@content`, or values with a Rich Text input configured — default to `block` or `text`, and plain values default to `span`. If the value has no configured input, CloudCannon falls back to the family of the host element (e.g. an `h2` behaves as `text`, a `div` as `block`).

### Image

Add `data-editable="image"` to (or around) an `<img>` element and bind its attributes with `data-prop-*`:

```astro
<img
  data-editable="image"
  data-prop-src="heroImage"
  data-prop-alt="heroImageAlt"
  data-prop-title="heroImageTitle"
  src={heroImage}
  alt={heroImageAlt}
  title={heroImageTitle}
/>
```

Or use the `editable-image` web component:

```astro
<editable-image data-prop-src="heroImage" data-prop-alt="heroImageAlt">
  <img src={heroImage} alt={heroImageAlt} />
</editable-image>
```

The region must contain an `<img>` element, either as its child or as the element itself.

Clicking an image region opens the *Edit Image* panel in the Visual Editor: upload from your machine, pick an existing file from the repository or a DAM, and edit alt/title details.

#### Editing picture elements

Image regions can also wrap a `<picture>` element. Put the region attributes on the `<picture>`; when the image changes, CloudCannon updates the preview URL on the `<source>` elements as well as the `<img>`:

```astro
<picture data-editable="image" data-prop-src="heroImage" data-prop-alt="heroImageAlt">
  <source srcset={heroImageAvif} type="image/avif" />
  <img src={heroImage} alt={heroImageAlt} />
</picture>
```

#### Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-prop` | Selector<{ src: string, alt?: string, title?: string}> | No | Selects an object holding the image details. Each image attribute binds to `<selector>.src`, `<selector>.alt`, and `<selector>.title`. |
| `data-prop-src` | Selector<string> | No | Selects the data for the image source. |
| `data-prop-alt` | Selector<string> | No | Selects the data for the alt text. |
| `data-prop-title` | Selector<string> | No | Selects the data for the title text. |

At least one selector is required. When you bind an object with `data-prop`, its value should only contain the `src`, `alt`, and `title` keys; anything else raises an error card suggesting you remove the extra binding.

## Structural regions

Structural regions define the shape of your page rather than a single value. Unlike value editable regions, structural editable regions can have other editable regions nested within them and they can compose with each other.

### Components

A component region binds a piece of markup to a **registered** component that the editor can re-render as its data changes.

```astro
<editable-component data-component="cta" data-prop="cta">
  <CTA {...cta} />
</editable-component>
```

#### Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-component` | String | Yes | The key the component was registered under (in Hugo, the partial path with extension, e.g. `card.html`). |
| `data-prop` | Selector<Object> | No | The data passed to the component as props. |

Inside the component's own file, add more editable regions for its text, images, and nested arrays. When a user edits the component's data in the Visual Editor, the registered renderer re-renders the component and the result is updated in place.

### Arrays and array items

An array region defines a region of markup that is built from a list of repeated elements. An array item region defines the boundary of a single element in that array. Array and array item regions always work as a pair, and as a rule of thumb they will be positioned on either side of the loop in your template.

```astro
<ul data-editable="array" data-prop="testimonials">
  {testimonials.map((testimonial) => (
    <li data-editable="array-item">
      <h4 data-editable="text" data-prop="name">{testimonial.name}</h4>
      <p data-editable="text" data-prop="quote">{testimonial.quote}</p>
    </li>
  ))}
</ul>
```

#### Adding items to an array

When a user adds an item in the Visual Editor, the editor has to invent markup for the new item. How it does that depends on how the array is set up:

##### Homogeneous arrays with a component

If the array names a component with `data-component`, every item is rendered by that component. A new item is created as a bare array item, and the registered component renders it from the item's data alone; no template markup is needed.

```astro
<ul data-editable="array" data-prop="testimonials" data-component="testimonial">
  {testimonials.map(() => (
    <li data-editable="array-item" data-component="testimonial">
      <Testimonial />
    </li>
  ))}
</ul>
```

##### Homogeneous arrays with a template

A `<template>` element inside the array region is a blueprint for new items. A template without a `data-id` is the blueprint for every new item:

```html
<ul data-editable="array" data-prop="features">
  <template>
    <li>
      <h4 data-editable="text" data-prop="title"></h4>
      <p data-editable="text" data-prop="description"></p>
    </li>
  </template>
</ul>
```

Multi-root templates are automatically wrapped in an `editable-array-item`. With neither a template nor a component, the editor clones the markup of an existing item instead; if the array is empty and has neither, you get an error card naming what to add.

##### Heterogeneous arrays with an id key and component key

When items have different shapes, each item names its own component. The array's `data-id-key` and `data-component-key` tell the editor which item keys hold the id and the component name; see [page building](#page-building) below for a full setup. A new item is created as a bare array item, and its component renders it:

```html
<main data-editable="array" data-prop="contentBlocks" data-component-key="_name">
  <section data-editable="array-item" data-id="HeroBlock" data-component="HeroBlock">
    <h2 data-editable="text" data-prop="title"></h2>
  </section>
</main>
```

Each item's `_name` value is used as both its id and its component, so a new item named `HeroBlock` is rendered by the registered `HeroBlock` component.

##### Heterogeneous arrays with an id key and template

A keyed `<template data-id="…">` is the blueprint for new items with that id; each new item picks its shape from the right template. The item's id comes from the array's `data-id-key`; a plain `<template>` (no `data-id`) is the fallback for ids without a keyed template.

```html
<ul data-editable="array" data-prop="blocks" data-id-key="type">
  <template data-id="hero">
    <section class="hero">
      <h2 data-editable="text" data-prop="title"></h2>
    </section>
  </template>
  <template data-id="stats">
    <section class="stats"><!-- ... --></section>
  </template>
</ul>
```

#### Special props

Two selectors are provided by the array structure itself rather than your data:

- `@length` — provided by array regions; the item count.
- `@index` — provided by each array item; the item's position.

Reference them like any other selector, with `data-prop="@length"` or `data-prop="@index"`.

#### Options

Array region:

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-prop` | Selector<Array> | Yes | The array to edit. |
| `data-id-key` | String | No | The item key that holds each item's unique identifier. See [page building](#page-building). |
| `data-component` | String | No | The registered component to render items that don't resolve a component from the component key. |
| `data-component-key` | String | No | The item key that holds the name of the registered component to render each item. |
| `data-direction` | `"row"` \| `"column"` \| `"row-reverse"` \| `"column-reverse"` | No | The direction the items are laid out in, so item controls and drag-and-drop work correctly. Defaults to the element's flex direction when it is a flex container, otherwise `column`. |

Array item region:

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-id` | String | No | The item's unique identifier, used to match items to `<template>` blueprints and reconcile the DOM as items move. Usually populated from the array's `data-id-key`. |
| `data-component` | String | No | The registered component used to render this item. Usually populated from the array's `data-component-key`. |

The array region assigns each item its `data-prop` (the item's index) at hydration; you don't set it yourself. Array item regions must be the immediate child of the array element — keep the pair as close together as possible.

With the regions in place, editors can add, duplicate, delete, reorder, and drag items — with the preview updating live.

### How prop selectors compose

Every `data-prop` selector is relative to the value of the nearest editable ancestor. The chain composes from the top of the page down:

```astro
<main data-editable="array" data-prop="blocks">
  {blocks.map((block, i) => (
    <section data-editable="array-item">
      <h2 data-editable="text" data-prop="title">{block.title}</h2>
      <img data-editable="image" data-prop-src="image" src={block.image} />
    </section>
  ))}
</main>
```

Reading the regions inside-out:

- The array region holds `blocks` — the whole array.
- Each array item is handed one entry: the array gives its items selectors `blocks.0`, `blocks.1`, …
- The text region inside the item resolves `title` against that value: `blocks.0.title`.

Writes travel the same chain in reverse. Editing the `<h2>` dispatches a change event for `title`; each ancestor prepends its own segment until the root region executes `blocks.0.title = "New value"` against the underlying file. That's also why the [best practice is to add regions parent-first](https://cloudcannon.com/documentation/developer-guides/set-up-visual-editing/an-overview-of-editable-regions/): a region nested inside an array or component can't resolve its selector until the ancestors exist.

## Page building

Combining the heterogeneous array setup with registered components gives you page building: each item in the array is a content block, and editors can add, reorder, and edit blocks to compose the page.

```astro
<main
  data-editable="array"
  data-prop="contentBlocks"
  data-id-key="_name"
  data-component-key="_name"
>
  {contentBlocks.map((block) => {
    const Component = components[block._name];
    return (
      <section data-editable="array-item" data-id={block._name} data-component={block._name}>
        <Component {...block} />
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
    description: Lorem ipsum dolor sit amet…
  - _name: StatsBlock
    stats:
      - figure: $200m
        text: Venture capital raised
      - figure: 40+
        text: Amazing team members
  - _name: ContactBlock
    text: Want to get in contact with us?
    button: Click here
```

Register each block component, and editors can add any block type, reorder them, and edit each one's contents. Keeping `_name` as both the id and the component key is common and convenient, but they can be separate keys. If both keys are the same then you only need to specify `data-component-key` and `data-id-key` will default to the same value.

## Referencing external data

`data-prop` selectors are relative to the current file (or the nearest editable ancestor). To point at data that lives somewhere else, start the selector with an `@` reference:

| Reference | Resolves to |
| --- | --- |
| `@collections[blog]` | The `blog` collection — usable directly as an array region's value |
| `@data[nav]` | The `nav` dataset (data files managed outside the page) |
| `@file[about.md]` | Another file's structured data |
| `@file[about.md].@content` | Another file's body content |
| `@content` | The current file's body content |

```astro
<ul data-editable="array" data-prop="@collections[blog]">
  <li data-editable="array-item">
    <h4 data-editable="text" data-prop="title" />
  </li>
</ul>
```

Notes:

- `@content` on a text region gives you a rich text editor over the file's Markdown/HTML body — see [Editing file content](#editing-file-content) for details and examples.
- Unqualified selectors after an `@` reference (e.g. `@file[about.md].seo.title`) continue into the resolved object.

## Literal props

For values that don't live in any file at all, `data-literal-prop-*` attributes pass literal values to a region. The attribute suffix is the name the value is passed under (see [passing values to editable regions](#passing-values-to-editable-regions)):

```html
<editable-component
  data-component="author-card"
  data-literal-prop-name="C. Kent"
  data-literal-prop-role="Support engineer"
/>
```

Here the `author-card` component receives `{ name: "C. Kent", role: "Support engineer" }`.

Values that parse as JSON are passed as structured values:

```html
<editable-component
  data-component="author-card"
  data-literal-prop-social='{"twitter": "@cloudcannon"}'
/>
```

Here the component receives `{ social: { twitter: "@cloudcannon" } }`. Values that don't parse as JSON are passed as plain strings.

## Source regions

Value and structural regions all edit **structured data**, and your templates re-render it. Source regions are the exception: they edit the **hard-coded markup of the template file itself**.

### How they work

```astro
<p
  data-editable="source"
  data-path="src/pages/about.astro"
  data-key="about-intro"
>
  We've been building websites since 2014.
</p>
```

When the file changes in the editor, the runtime fetches the raw source of the file, finds the element by locating its `data-key` attribute, and then edits its content directly in the source file.

### Limitations

- **Static markup only.** The region edits literal HTML in the file. If the element contains any templating you must have a matching Snippet configured, otherwise it cannot be safely parsed by the editor.
- **`data-key` values must be unique within a file**, and the attribute must survive into the built output.
- Because source editable regions edit the source directly, edits from one region will update all other places where that file is referenced. Any dynamic content that isn't configured as a Snippet will be overwritten with static content.

### When to use them

Use a source region when there is no structured data key behind the text. For example, landing pages and standalone templates with hard-coded copy, or a call-to-action baked into a layout. It's the escape hatch that makes hard-coded HTML editable without restructuring your templates around a data file.

If you *can* move the value into front matter or a data file, prefer a text region: data-driven regions re-render live and keep your content where content belongs.

### Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `data-path` | String | Yes | The template file the text lives in, relative to the site root. A leading `/` is optional. This is a file path, not a selector. |
| `data-key` | String | Yes | The name identifying this region within the file. Must be unique among all `data-key` values in the same file. |
| `data-type` | `"span"` \| `"text"` \| `"block"` | No | Controls the rich text editing surface, as with [text regions](#text). Source content is edited as HTML. |
