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
  // --- Always registered by 11ty (defaultConfig.js) ---
  "slug",
  "slugify",
  "log",
  "url",
  "getCollectionItem",
  "getPreviousCollectionItem",
  "getNextCollectionItem",
  "getCollectionItemIndex",

  // --- Opt-in 11ty plugins (user must addPlugin to activate server-side) ---
  "inputPathToUrl",   // InputPathToUrl plugin
  "htmlBaseUrl",      // HtmlBasePlugin
  "serverlessUrl",    // Eleventy Serverless plugin (deprecated/removed in v3)
  "renderContent",    // RenderPlugin

  // --- Not in 11ty — common doc/starter patterns, user must register manually ---
  "dateToRfc3339",
  "dateToRfc822",
  "htmlDateString",
  "getNewestCollectionItemDate",
];

/** @type {string[]} */
export const builtinShortcodeNames = [
  // --- Opt-in 11ty plugin (RenderPlugin) ---
  "renderFile",
];
