/**
 * Browser-compatible implementations of Eleventy's built-in filters and
 * shortcodes. Filters that require Eleventy's build-time internals are
 * registered as pass-through stubs that warn once, so templates keep
 * rendering. `registerEleventyBuiltins(engine)` is the single entry point
 * the generated bundle calls after `createSharedLiquidEngine()` to wire
 * everything up.
 */

import sindresorhusSlugify from "@sindresorhus/slugify";
import simovSlugify from "slugify";
import { warnOnce } from "../../liquid/logger.mjs";
import { getPageMap, normalizeInputPath } from "../../liquid/page-map.mjs";
import { createShortcodeTag } from "../../liquid/shortcodes.mjs";
import { builtinFilterNames, builtinShortcodeNames } from "./builtin-names.mjs";
import {
  createRenderContentFilter,
  createRenderFileShortcode,
  createRenderTemplateTag,
} from "./liquid-render.mjs";

// Re-export so existing browser-bundle consumers keep working. The lists
// themselves live in `./builtin-names.mjs` so the Node-side Eleventy plugin
// can import them without dragging slugify into config-load.
export { builtinFilterNames, builtinShortcodeNames };

/**
 * Logs value to console (pass-through filter).
 *
 * @param {any} value - Value to log
 * @param {string} [prefix] - Optional prefix for the log message
 * @returns {any} The original value (for chaining)
 */
export function logFilter(value, prefix = "") {
  if (prefix) {
    console.log(`[${prefix}]`, value);
  } else {
    console.log(value);
  }
  return value;
}

/**
 * Browser port of Eleventy's `slug` filter
 * (`@11ty/eleventy/src/Filters/Slug.js`) — the permissive variant. Backed by
 * `simov/slugify`, which keeps characters like `+`, `@`, `.` and has built-in
 * word substitutions (`&` → `and`, `%` → `percent`).
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function slugFilter(str, options = {}) {
  return simovSlugify(`${str}`, { replacement: "-", lower: true, ...options });
}

/**
 * Browser port of Eleventy's `slugify` filter
 * (`@11ty/eleventy/src/Filters/Slugify.js`) — the strict ASCII-safe variant.
 * Backed by `@sindresorhus/slugify`, which treats non-alphanumerics as
 * separators and transliterates many scripts.
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function slugifyFilter(str, options = {}) {
  return sindresorhusSlugify(`${str}`, { decamelize: false, ...options });
}

/**
 * Browser port of Eleventy's `url` filter
 * (`@11ty/eleventy/src/Filters/Url.js`). Absolute URLs and protocol-relative
 * URLs pass through unchanged; root-relative URLs get `pathPrefix` prepended
 * when one is supplied. Eleventy's filter throws if `pathPrefix` is missing
 * because the config wires one in automatically — in the browser we don't
 * have that, so the no-prefix branch returns the input unchanged rather than
 * exploding.
 *
 * @param {string} url - URL to normalize
 * @param {string} [pathPrefix] - Optional path prefix to prepend
 * @returns {string} Normalized URL
 */
export function urlFilter(url, pathPrefix = "") {
  if (!url) return "";
  const urlString = String(url);

  if (isAbsoluteUrl(urlString)) return urlString;
  if (urlString.startsWith("//") && urlString !== "//") return urlString;

  if (!pathPrefix) return urlString;
  const normalizedPrefix = `/${pathPrefix.replace(/^\/+|\/+$/g, "")}`;
  if (urlString.startsWith("/")) return `${normalizedPrefix}${urlString}`;
  return urlString;
}

/** Matches Eleventy's `Util/ValidUrl.js`: parseable by `new URL()` → absolute. */
function isAbsoluteUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Coerces an input (Date, ISO string, epoch number) into a Date.
 * Returns `null` for unusable inputs so filters can bail gracefully.
 *
 * @param {any} value
 * @returns {Date | null}
 */
function toDate(value) {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ISO 8601 / RFC 3339 date string (e.g. "2026-04-21T00:00:00.000Z").
 *
 * @param {Date | string | number} date
 * @returns {string}
 */
export function dateToRfc3339(date) {
  const d = toDate(date);
  return d ? d.toISOString() : "";
}

/**
 * RFC 822 / RFC 1123 date string (e.g. "Tue, 21 Apr 2026 00:00:00 GMT").
 *
 * @param {Date | string | number} date
 * @returns {string}
 */
export function dateToRfc822(date) {
  const d = toDate(date);
  return d ? d.toUTCString() : "";
}

/**
 * HTML date string in `YYYY-MM-DD` form, used for `<time datetime>` attributes.
 *
 * @param {Date | string | number} date
 * @returns {string}
 */
export function htmlDateString(date) {
  const d = toDate(date);
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Returns the newest `date` field across a collection.
 *
 * @param {Array<{date?: any}>} collection
 * @param {Date | string | number} [emptyFallback]
 * @returns {Date}
 */
export function getNewestCollectionItemDate(collection, emptyFallback) {
  if (!Array.isArray(collection) || collection.length === 0) {
    return toDate(emptyFallback) ?? new Date(0);
  }
  let newest = 0;
  for (const item of collection) {
    const d = toDate(item?.date);
    if (d && d.getTime() > newest) newest = d.getTime();
  }
  return newest ? new Date(newest) : (toDate(emptyFallback) ?? new Date(0));
}

/**
 * Finds the index of `page` in `collection` by matching `inputPath`.
 *
 * `await page.inputPath` covers both shapes we get in practice: our `page`
 * global is a Proxy that returns Promises (await resolves to the string),
 * and a collection item is a plain object whose `inputPath` is already a
 * string (await on a non-thenable is a no-op). Upstream 11ty trusts
 * `page` to be a page object with string properties and compares with an
 * outputPath/url tie-breaker; in the editor each inputPath maps to one
 * canonical item so inputPath-only is enough.
 *
 * @param {Array<{inputPath?: string}>} collection
 * @param {any} page
 * @returns {Promise<number>}
 */
async function indexInCollection(collection, page) {
  if (!Array.isArray(collection)) return -1;
  if (!page) {
    warnOnce(
      "collection-item-no-page",
      "Eleventy collection-item filter called without a `page` argument. " +
        "In live editing, pass the page/item explicitly (e.g. `collections.posts | getCollectionItem: page`).",
    );
    return -1;
  }
  const inputPath = await page.inputPath;
  if (typeof inputPath !== "string" || !inputPath) return -1;
  return collection.findIndex((item) => item?.inputPath === inputPath);
}

/**
 * Returns the current item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export async function getCollectionItem(collection, page) {
  const i = await indexInCollection(collection, page);
  return i >= 0 ? collection[i] : undefined;
}

/**
 * Returns the previous sequential item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export async function getPreviousCollectionItem(collection, page) {
  const i = await indexInCollection(collection, page);
  return i > 0 ? collection[i - 1] : undefined;
}

/**
 * Returns the next sequential item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export async function getNextCollectionItem(collection, page) {
  const i = await indexInCollection(collection, page);
  return i >= 0 && i < collection.length - 1 ? collection[i + 1] : undefined;
}

/**
 * Returns the 0-based index of the current item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 * @returns {Promise<number>}
 */
export async function getCollectionItemIndex(collection, page) {
  return indexInCollection(collection, page);
}

/**
 * Builds a pass-through filter that warns once on first use.
 * Used for Eleventy filters that depend on build-time internals we don't have
 * in the browser.
 *
 * @param {string} filterName
 * @param {string} reason - Human-readable explanation of the limitation
 * @returns {(value: any) => any}
 */
function passThroughStub(filterName, reason) {
  return (value) => {
    warnOnce(
      `filter-stub:${filterName}`,
      `Eleventy filter "${filterName}" is not supported in live editing (${reason}). ` +
        "Returning the input unchanged.",
    );
    return value;
  };
}

/**
 * Browser port of the `inputPathToUrl` plugin filter. Resolves against the
 * build-time page map (`registerPageMap`), which captures every page 11ty
 * produced — including those with permalinks computed by JS config or
 * `eleventyComputed`. Misses pass through with a warn-once so just-added
 * files that weren't in the last build degrade gracefully rather than
 * throwing.
 *
 * If the host opted out of the page map (`liquid.pageMap: false`) the map
 * is empty and every call misses; behave the same as the legacy stub.
 *
 * @param {unknown} inputPath
 * @returns {string}
 */
export function inputPathToUrlFilter(inputPath) {
  if (typeof inputPath !== "string" || !inputPath) {
    return typeof inputPath === "string" ? inputPath : "";
  }
  const entry = getPageMap()[normalizeInputPath(inputPath)];
  if (entry?.url) return entry.url;
  warnOnce(
    `input-path-to-url-miss:${inputPath}`,
    `inputPathToUrl: no build-time URL recorded for "${inputPath}". ` +
      "This usually means the file wasn't in the last build, or the page " +
      "map is disabled via `liquid.pageMap: false`. Returning the input " +
      "unchanged.",
  );
  return inputPath;
}

/** @type {Record<string, any>} */
export const eleventyFilters = {
  slug: slugFilter,
  slugify: slugifyFilter,
  log: logFilter,
  url: urlFilter,
  dateToRfc3339,
  dateToRfc822,
  htmlDateString,
  getNewestCollectionItemDate,
  getCollectionItem,
  getPreviousCollectionItem,
  getNextCollectionItem,
  getCollectionItemIndex,
  inputPathToUrl: inputPathToUrlFilter,
  htmlBaseUrl: passThroughStub(
    "htmlBaseUrl",
    "it requires Eleventy's pathPrefix/HTML base config",
  ),
  serverlessUrl: passThroughStub(
    "serverlessUrl",
    "serverless routing is a build-time concept",
  ),
};

/**
 * Registers all Eleventy built-ins on the shared Liquid engine:
 *   - the plain filters from `eleventyFilters` (slugify, url, dateToRfc3339, …)
 *   - the RenderPlugin shims: `renderTemplate` (tag), `renderFile`
 *     (shortcode), `renderContent` (filter)
 *
 * The shims live in `./liquid-render.mjs`; this is the single entry point
 * that wires both groups onto the engine.
 *
 * @param {import("liquidjs").Liquid} liquidEngine - Engine returned by `createSharedLiquidEngine()`
 */
export function registerEleventyBuiltins(liquidEngine) {
  for (const [name, fn] of Object.entries(eleventyFilters)) {
    liquidEngine.registerFilter(name, fn);
  }

  liquidEngine.registerTag(
    "renderTemplate",
    createRenderTemplateTag(liquidEngine),
  );
  liquidEngine.registerTag(
    "renderFile",
    createShortcodeTag("renderFile", createRenderFileShortcode(liquidEngine)),
  );
  liquidEngine.registerFilter(
    "renderContent",
    createRenderContentFilter(liquidEngine),
  );
}
