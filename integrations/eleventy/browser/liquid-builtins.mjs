// Browser ports of Eleventy's built-in filters and shortcodes. Filters needing
// build-time internals are warn-once pass-through stubs so templates keep
// rendering. `registerEleventyBuiltins(engine)` wires everything up.

import sindresorhusSlugify from "@sindresorhus/slugify";
import simovSlugify from "slugify";
import { warnOnce } from "../../liquid/logger.mjs";
import { getPageMap, normalizeInputPath } from "../../liquid/page-map.mjs";
import { createShortcodeTag } from "../../liquid/shortcodes.mjs";
import {
	createRenderContentFilter,
	createRenderFileShortcode,
	createRenderTemplateTag,
} from "./liquid-render.mjs";

/**
 * @param {any} value
 * @param {string} [prefix]
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
 * Eleventy's `slug` filter (`Filters/Slug.js`), backed by `simov/slugify`
 * (permissive: keeps `+`, `@`, `.`; substitutes `&`→`and`, `%`→`percent`).
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
 */
export function slugFilter(str, options = {}) {
	return simovSlugify(`${str}`, { replacement: "-", lower: true, ...options });
}

/**
 * Eleventy's `slugify` filter (`Filters/Slugify.js`), backed by
 * `@sindresorhus/slugify` (strict ASCII: non-alphanumerics become separators).
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
 */
export function slugifyFilter(str, options = {}) {
	return sindresorhusSlugify(`${str}`, { decamelize: false, ...options });
}

/**
 * Eleventy's `url` filter (`Filters/Url.js`). Absolute and protocol-relative
 * URLs pass through; root-relative URLs get `pathPrefix` prepended when given.
 * Unlike upstream (which always has a `pathPrefix`), the no-prefix branch
 * returns the input unchanged rather than throwing.
 *
 * @param {string} url
 * @param {string} [pathPrefix]
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
function isAbsoluteUrl(/** @type {string} */ url) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/** Coerces an input (Date, ISO string, epoch number) into a Date; `null` for unusable input. */
function toDate(/** @type {any} */ value) {
	if (value instanceof Date)
		return Number.isNaN(value.getTime()) ? null : value;

	if (value === null || value === undefined || value === "") return null;

	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO 8601 / RFC 3339 (e.g. "2026-04-21T00:00:00.000Z"). */
export function dateToRfc3339(/** @type {Date | string | number} */ date) {
	const d = toDate(date);

	return d ? d.toISOString() : "";
}

/** RFC 822 / RFC 1123 (e.g. "Tue, 21 Apr 2026 00:00:00 GMT"). */
export function dateToRfc822(/** @type {Date | string | number} */ date) {
	const d = toDate(date);

	return d ? d.toUTCString() : "";
}

/** `YYYY-MM-DD` form, used for `<time datetime>` attributes. */
export function htmlDateString(/** @type {Date | string | number} */ date) {
	const d = toDate(date);

	return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * @param {Array<{date?: any}>} collection
 * @param {Date | string | number} [emptyFallback]
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
 * Index of `page` in `collection` by `inputPath`. The editor doesn't model
 * pagination, so `inputPath` alone is unique (upstream also tie-breaks on
 * `outputPath || url`). `await page.inputPath` handles both shapes: the `page`
 * global is a Promise-returning Proxy; a collection item's is already a string.
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

export async function getCollectionItem(
	/** @type {any[]} */ collection,
	/** @type {any} */ page,
) {
	const i = await indexInCollection(collection, page);

	return i >= 0 ? collection[i] : undefined;
}

export async function getPreviousCollectionItem(
	/** @type {any[]} */ collection,
	/** @type {any} */ page,
) {
	const i = await indexInCollection(collection, page);

	return i > 0 ? collection[i - 1] : undefined;
}

export async function getNextCollectionItem(
	/** @type {any[]} */ collection,
	/** @type {any} */ page,
) {
	const i = await indexInCollection(collection, page);

	return i >= 0 && i < collection.length - 1 ? collection[i + 1] : undefined;
}

export async function getCollectionItemIndex(
	/** @type {any[]} */ collection,
	/** @type {any} */ page,
) {
	return indexInCollection(collection, page);
}

/**
 * Pass-through filter that warns once — for Eleventy filters that depend on
 * build-time internals we don't have in the browser.
 *
 * @param {string} filterName
 * @param {string} reason
 */
function passThroughStub(filterName, reason) {
	return (/** @type {any} */ value) => {
		warnOnce(
			`filter-stub:${filterName}`,
			`Eleventy filter "${filterName}" is not supported in live editing (${reason}). ` +
				"Returning the input unchanged.",
		);

		return value;
	};
}

/**
 * Browser port of the `inputPathToUrl` plugin filter, resolving against the
 * build-time page map. Misses (e.g. a file not in the last build) warn-once
 * and pass through rather than throwing.
 *
 * @param {unknown} inputPath
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
			"This usually means the file wasn't in the last build. Returning the " +
			"input unchanged.",
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
 * Builtin names the config auto-mirror skips, so a same-named config helper
 * doesn't clobber our port. Derived from the implementations so they can't
 * drift; `renderContent`/`renderFile` are the RenderPlugin shims.
 *
 * @type {string[]}
 */
export const builtinFilterNames = [
	...Object.keys(eleventyFilters),
	"renderContent",
];

/** @type {string[]} */
export const builtinShortcodeNames = ["renderFile"];

/**
 * Wires `eleventyFilters` plus the RenderPlugin shims onto the shared engine.
 *
 * @param {import("liquidjs").Liquid} liquidEngine
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
