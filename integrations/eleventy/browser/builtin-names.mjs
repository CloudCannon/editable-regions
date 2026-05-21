/**
 * Names of the filters and shortcodes that have handwritten browser ports in
 * `./liquid-builtins.mjs` (and the RenderPlugin shims in `./liquid-render.mjs`).
 *
 * Kept in this file — separate from the implementations — so the Node-side
 * Eleventy plugin (`integrations/eleventy/index.mjs`) can import the skip
 * lists without transitively pulling in browser-only dependencies
 * (`slugify`, `@sindresorhus/slugify`) at config-load time. The implementation
 * file imports these too, so this stays the single source of truth.
 *
 * If you add a filter/shortcode to `liquid-builtins.mjs`, add its name here.
 */

/** @type {string[]} */
export const builtinFilterNames = [
  "slug",
  "slugify",
  "log",
  "url",
  "dateToRfc3339",
  "dateToRfc822",
  "htmlDateString",
  "getNewestCollectionItemDate",
  "getCollectionItem",
  "getPreviousCollectionItem",
  "getNextCollectionItem",
  "getCollectionItemIndex",
  "inputPathToUrl",
  "htmlBaseUrl",
  "serverlessUrl",
  "renderContent",
];

/** @type {string[]} */
export const builtinShortcodeNames = ["renderFile"];
