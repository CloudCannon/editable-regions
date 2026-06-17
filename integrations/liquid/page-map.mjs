/**
 * Build-time snapshot of every page Eleventy produced, keyed by normalized
 * input path. Holds permalinks computed by JS config or `eleventyComputed`,
 * which the live front-matter read can't see. Lives in its own module so
 * consumers can import it without the side-effects of `helpers/cloudcannon.mjs`.
 *
 * @typedef {{ url?: string, outputPath?: string }} PageMapEntry
 */

/** @type {Record<string, PageMapEntry>} */
let pageMap = {};

/** @param {Record<string, PageMapEntry> | null | undefined} map */
export function registerPageMap(map) {
	pageMap = map ?? {};
}

export function getPageMap() {
	return pageMap;
}

/**
 * Normalises an Eleventy input path (`./src/foo.md`, `/src/foo.md`) to the
 * no-leading-slash form used as the map's keys, so paths from different
 * sources (11ty `results`, CC `currentFile().path`) compare equal.
 *
 * @param {string | null | undefined} p
 */
export function normalizeInputPath(p) {
	if (typeof p !== "string" || !p) return "";
	return p.replace(/^\.\//, "").replace(/^\/+/, "");
}
