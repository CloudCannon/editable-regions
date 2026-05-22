/**
 * Names of the filters and shortcodes that have handwritten browser ports in
 * `./liquid-builtins.mjs` (and the RenderPlugin shims in `./liquid-render.mjs`).
 * Kept separate from the implementations so the Node-side Eleventy plugin
 * can import the skip lists without transitively pulling in the browser-only
 * `slugify` dependencies at config-load time.
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
