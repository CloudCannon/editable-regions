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
import {
	createRenderContentFilter,
	createRenderFileShortcode,
	createRenderTemplateTag,
} from "./liquid-render.mjs";

/**
 * Pass-through filter — logs and returns the value.
 *
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
 * Permissive variant of Eleventy's `slug` filter
 * (`@11ty/eleventy/src/Filters/Slug.js`). Backed by `simov/slugify`, which
 * keeps characters like `+`, `@`, `.` and has built-in word substitutions
 * (`&` → `and`, `%` → `percent`).
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
 */
export function slugFilter(str, options = {}) {
	return simovSlugify(`${str}`, { replacement: "-", lower: true, ...options });
}

/**
 * Strict ASCII-safe variant of Eleventy's `slugify` filter
 * (`@11ty/eleventy/src/Filters/Slugify.js`). Backed by
 * `@sindresorhus/slugify`, which treats non-alphanumerics as separators and
 * transliterates many scripts.
 *
 * @param {unknown} str
 * @param {Record<string, any>} [options]
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
 * Finds the index of `page` in `collection` by matching `inputPath`. Upstream
 * 11ty also tie-breaks on `outputPath || url` for paginated cursors, but the
 * editor doesn't model pagination (one page-map entry per `inputPath`), so
 * `inputPath` alone is unique here.
 *
 * `await page.inputPath` handles both shapes: the `page` global is a Proxy
 * returning Promises, while a collection item's `inputPath` is already a
 * string (awaiting a non-thenable is a no-op).
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
 * Builds a pass-through filter that warns once on first use. Used for
 * Eleventy filters that depend on build-time internals we don't have in the
 * browser.
 *
 * @param {string} filterName
 * @param {string} reason - Human-readable explanation of the limitation
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
 * Browser port of the `inputPathToUrl` plugin filter. Resolves against the
 * build-time page map (`registerPageMap`), which captures permalinks computed
 * by JS config or `eleventyComputed`. Misses (files not in the last build, or
 * `liquid.pageMap: false`) pass through with a warn-once rather than throwing.
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
 * Names of the builtins this module registers, derived from the
 * implementations above so they can't drift. The config auto-mirror skips
 * these so a user's same-named config helper doesn't clobber our browser port.
 * `renderContent` / `renderFile` are the RenderPlugin shims wired on in
 * `registerEleventyBuiltins` (`renderTemplate` is a tag and isn't mirrored).
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
 * Wires the plain filters from `eleventyFilters` plus the RenderPlugin shims
 * (`renderTemplate`, `renderFile`, `renderContent`) onto the shared engine.
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
