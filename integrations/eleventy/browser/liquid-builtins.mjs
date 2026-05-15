/**
 * Browser-compatible implementations of Eleventy's built-in filters and
 * shortcodes. Filters that require Eleventy's build-time internals are
 * registered as pass-through stubs that warn once, so templates keep
 * rendering. `registerEleventyBuiltins(engine)` is the single entry point
 * the generated bundle calls after `createSharedLiquidEngine()` to wire
 * everything up.
 */

import slugify from "@sindresorhus/slugify";
import { warnOnce } from "../../liquid/logger.mjs";
import { createShortcodeTag } from "../../liquid/shortcodes.mjs";
import {
  createRenderContentFilter,
  createRenderFileShortcode,
  createRenderTemplateTag,
} from "./liquid-render.mjs";

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
 * Normalizes URL paths (simplified browser version of Eleventy's url filter).
 *
 * @param {string} url - URL to normalize
 * @param {string} [pathPrefix] - Optional path prefix to prepend
 * @returns {string} Normalized URL
 */
export function urlFilter(url, pathPrefix = "") {
  if (!url) {
    return "";
  }

  const urlString = String(url);

  if (pathPrefix) {
    const normalizedPrefix = `/${pathPrefix.replace(/^\/+|\/+$/g, "")}`;

    if (urlString.startsWith("/")) {
      return normalizedPrefix + urlString;
    }
    return urlString;
  }

  const normalized = urlString.replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
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
 * Resolves the `inputPath` identifier for a `page`-ish argument passed to a
 * collection-item filter. Accepts a full page object, a collection item
 * (which has `inputPath` at the top level), or a raw string path.
 *
 * @param {any} page
 * @returns {string | null}
 */
function resolveInputPath(page) {
  if (!page) return null;
  if (typeof page === "string") return page;
  if (typeof page.inputPath === "string") return page.inputPath;
  if (page.page && typeof page.page.inputPath === "string") {
    return page.page.inputPath;
  }
  return null;
}

/**
 * Finds the index of the current page in a collection by matching `inputPath`.
 *
 * @param {Array<{inputPath?: string}>} collection
 * @param {any} page
 * @returns {number}
 */
function indexInCollection(collection, page) {
  if (!Array.isArray(collection)) return -1;
  const inputPath = resolveInputPath(page);
  if (!inputPath) {
    warnOnce(
      "collection-item-no-page",
      "Eleventy collection-item filter called without a resolvable `page` argument. " +
        "In live editing, pass the page/item explicitly (e.g. `collections.posts | getCollectionItem: page`).",
    );
    return -1;
  }
  return collection.findIndex((item) => item?.inputPath === inputPath);
}

/**
 * Returns the current item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export function getCollectionItem(collection, page) {
  const i = indexInCollection(collection, page);
  return i >= 0 ? collection[i] : undefined;
}

/**
 * Returns the previous sequential item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export function getPreviousCollectionItem(collection, page) {
  const i = indexInCollection(collection, page);
  return i > 0 ? collection[i - 1] : undefined;
}

/**
 * Returns the next sequential item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 */
export function getNextCollectionItem(collection, page) {
  const i = indexInCollection(collection, page);
  return i >= 0 && i < collection.length - 1 ? collection[i + 1] : undefined;
}

/**
 * Returns the 0-based index of the current item in a collection.
 *
 * @param {any[]} collection
 * @param {any} page
 * @returns {number}
 */
export function getCollectionItemIndex(collection, page) {
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

/** @type {Record<string, any>} */
export const eleventyFilters = {
  slugify,
  slug: slugify,
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
  inputPathToUrl: passThroughStub(
    "inputPathToUrl",
    "it requires Eleventy's build-time input-path-to-url map",
  ),
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
 * Filter names with handwritten browser ports — skipped by the auto-mirror
 * pass so the user's `eleventyConfig.addFilter` registration doesn't clobber
 * our port. Derived from `eleventyFilters` plus `renderContent` (registered
 * separately in `registerEleventyBuiltins` from `liquid-render.mjs`).
 *
 * @type {string[]}
 */
export const builtinFilterNames = [...Object.keys(eleventyFilters), "renderContent"];

/**
 * Shortcode names with handwritten ports. `renderFile` is implemented in
 * `liquid-render.mjs` and registered in `registerEleventyBuiltins`.
 *
 * @type {string[]}
 */
export const builtinShortcodeNames = ["renderFile"];

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
    createShortcodeTag(createRenderFileShortcode(liquidEngine), "renderFile"),
  );
  liquidEngine.registerFilter(
    "renderContent",
    createRenderContentFilter(liquidEngine),
  );
}
