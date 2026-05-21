/**
 * Build-time snapshot of every page Eleventy produced, keyed by normalized
 * input path. Populated once at bundle init by `registerPageMap(...)` (see
 * the call the plugin emits in `integrations/eleventy/index.mjs`), and
 * consulted by the page / collections proxies and the `inputPathToUrl`
 * filter to resolve URLs and output paths — including for permalinks
 * computed by JS config or `eleventyComputed`, which the live front-matter
 * read can't see.
 *
 * Storage lives in its own module (rather than in `liquid/index.mjs` or
 * `globals.mjs`) so consumers in either direction can import without
 * pulling in the browser-runtime side-effects of `helpers/cloudcannon.mjs`.
 *
 * @typedef {{ url?: string, outputPath?: string }} PageMapEntry
 */

/** @type {Record<string, PageMapEntry>} */
let pageMap = {};

/**
 * Stores the build-time page map. Called by the generated bundle exactly
 * once, after `createSharedLiquidEngine`. Replacing the map is a no-op
 * concern: the bundle only emits one call per build.
 *
 * @param {Record<string, PageMapEntry> | null | undefined} map
 * @returns {void}
 */
export function registerPageMap(map) {
  pageMap = map ?? {};
}

/**
 * Returns the registered page map. Returns an empty object before
 * `registerPageMap` runs so consumers can do safe lookups without guarding.
 *
 * @returns {Record<string, PageMapEntry>}
 */
export function getPageMap() {
  return pageMap;
}

/**
 * Normalises an Eleventy-style input path (`./src/foo.md`, `/src/foo.md`)
 * to the canonical no-leading-`./` form we use as the map's keys. Lets us
 * compare paths from different sources (11ty's `results`, CC's
 * `currentFile().path`) without each caller doing its own stripping.
 *
 * @param {string | null | undefined} p
 * @returns {string}
 */
export function normalizeInputPath(p) {
  if (typeof p !== "string" || !p) return "";
  return p.replace(/^\.\//, "").replace(/^\/+/, "");
}
