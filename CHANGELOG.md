# Changelog

<!--
    Add changes to the Unreleased section during development.
    Do not change this header — the GitHub action that releases
    this project will edit this file and add the version header for you.
    The Unreleased block will also be used for the GitHub release notes.
-->

## 0.0.19
* Added full support for Svelte components and Svelte in Astro components
* Added full support for Vue components and Vue in Astro components
* Fixed an issue where React in Astro components would not render correctly in some cases
* Fixed an issue where slot contents would not be passed through Astro components in some cases

## 0.0.18
* Added full support for Eleventy sites with liquid components.

## 0.0.17
* Fixed an issue where text nodes were not re-rendering correctly in some cases

## 0.0.16
* Adds experimental support for Svelte components.

## 0.0.14
* Updated to TypeScript 6 internally.

## 0.0.13

* Improved compatibility for `astro:content` in component editable regions. The `render` function now returns the collection entry's frontmatter as `remarkPluginFrontmatter` instead of an empty object.
* Fixed an issue where image editable region data panels wouldn't update correctly if the image element was removed from the DOM.
* Fixed an issue where text editable regions were not correctly escaping snippets in codeblocks for MDX file content.
* Added experimental support for Eleventy sites with liquid components.

## 0.0.11

* Fixed an issue where component editable regions wouldn't correctly update the tag name of child editable regions.
* Fixed an issue where component editable regions would sometimes briefly show an error state when the editor first loaded.

## 0.0.10

* Component editable regions now display an error when the component key cannot be found within 4 seconds.
* Added support for passing literal values to editable regions, using `data-literal-*` attributes.
* Added the `@length` special prop to array editable regions.
* Added the `@index` special prop to array-item editable regions.
* Fixed an issue where some Astro virtual modules were being shimmed unnecessarily, preventing them from functioning on the client.
  * The Astro client router and view transitions will now function alongside the editable regions integration
* Fixed an issue where noscript tags inside editable components would always be active when viewed in Chrome.
* Array and component editable regions now reuse partial renders from parent editable regions. This should improve rendering performance and allow for sub components to render correctly in more cases.
