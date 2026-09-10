// Builders for the `page` and `collections` globals on the shared Liquid
// engine. Both return Promises that LiquidJS awaits at the globals level.
// `page` resolves to a plain object; `collections` resolves to an object whose
// keys are lazy getters, so a template only pays for the collections it reads.

import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.mjs";
import { getPageMap, normalizeInputPath } from "./page-map.mjs";

/** @type {{ directories?: { output?: string } } | null} */
let eleventyData = null;

/** @param {{ directories?: { output?: string } } | null} data */
export function setEleventyData(data) {
	eleventyData = data;
}

/** Strips the file extension from a path. */
function stripExtension(/** @type {string} */ p) {
	return p.replace(/\.[^./]+$/, "");
}

/**
 * 11ty's folder-style permalink: trailing-slash URL, `index` files mapping to
 * the parent dir. Last-resort fallback when neither a literal front-matter
 * `permalink` nor the page map resolves a URL.
 */
function deriveDefaultUrl(/** @type {string} */ inputPath) {
	const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
	const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
	const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
	return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

/**
 * A front-matter `permalink` usable verbatim: a plain string with no Liquid
 * templating. Templated permalinks (e.g. `"/{{ page.date }}/"`) need the full
 * build context to render, so we return `undefined` and let the caller fall
 * back to the page map's already-resolved value.
 */
function literalPermalink(
	/** @type {Record<string, any> | null | undefined} */ data,
) {
	const permalink = data?.permalink;
	if (typeof permalink !== "string") return undefined;
	if (permalink.includes("{{") || permalink.includes("{%")) return undefined;
	return permalink;
}

/**
 * Resolves the URL for an input file, in priority order: literal front-matter
 * `permalink` (so editor edits show before a rebuild) → build-time page map →
 * 11ty's folder-style default.
 */
function resolveUrl(
	/** @type {Record<string, any> | null | undefined} */ data,
	/** @type {string} */ inputPath,
) {
	const permalink = literalPermalink(data);
	if (permalink) return permalink;
	const mapped = getPageMap()[normalizeInputPath(inputPath)];
	if (mapped?.url) return mapped.url;
	return deriveDefaultUrl(inputPath);
}

/** Same priority layering as `resolveUrl`, for the output path. */
function resolveOutputPath(
	/** @type {Record<string, any> | null | undefined} */ data,
	/** @type {string} */ inputPath,
) {
	const outputDir = eleventyData?.directories?.output;
	const permalink = literalPermalink(data);
	if (permalink) {
		return outputDir ? joinOutputPath(outputDir, permalink) : undefined;
	}
	const mapped = getPageMap()[normalizeInputPath(inputPath)];
	if (mapped?.outputPath) return mapped.outputPath;
	if (!outputDir) return undefined;
	return joinOutputPath(outputDir, deriveDefaultUrl(inputPath));
}

/** Basename minus extension. Matches 11ty's `fileSlug` derivation. */
function deriveFileSlug(/** @type {string} */ inputPath) {
	const base = inputPath.split("/").pop() ?? "";
	return stripExtension(base);
}

/** Full path minus extension, with a leading slash. */
function deriveFilePathStem(/** @type {string} */ inputPath) {
	const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
	return stem.startsWith("/") ? stem : `/${stem}`;
}

/** Coerces a front-matter date value into a Date, or `undefined`. */
function toDate(/** @type {unknown} */ raw) {
	if (!raw) return undefined;
	const d = new Date(/** @type {any} */ (raw));
	return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Joins an output dir and URL the way 11ty does: trailing-slash URLs become
 * `<dir><url>index.html`; others are appended as-is.
 */
function joinOutputPath(
	/** @type {string} */ outputDir,
	/** @type {string} */ url,
) {
	const dir = outputDir.replace(/\/+$/, "");
	const tail = url.endsWith("/") ? `${url}index.html` : url;
	return `${dir}${tail}`;
}

/**
 * Materialises a CC API file into the 11ty collection-item shape.
 *
 * @param {import("@cloudcannon/visual-editor-api").CloudCannonVisualEditorAPIV1File} file
 */
async function materialiseFile(file) {
	const data = (await file.data.get()) ?? {};
	return {
		url: resolveUrl(data, file.path),
		outputPath: resolveOutputPath(data, file.path),
		inputPath: file.path,
		fileSlug: deriveFileSlug(file.path),
		filePathStem: deriveFilePathStem(file.path),
		date: toDate(/** @type {any} */ (data).date),
		data,
	};
}

/**
 * Builds the `page` object for the file open in the Visual Editor. Called
 * before every render so live front-matter edits are reflected immediately.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function buildPageData() {
	await apiLoadedPromise;
	let file;
	try {
		file = CloudCannon?.currentFile?.();
	} catch {
		// No current file (page with no associated source).
		return {};
	}
	if (!file) return {};
	const inputPath = file.path;
	const data = (await file.data.get()) ?? {};
	return {
		inputPath,
		fileSlug: deriveFileSlug(inputPath),
		filePathStem: deriveFilePathStem(inputPath),
		outputFileExtension: "html",
		url: resolveUrl(data, inputPath),
		outputPath: resolveOutputPath(data, inputPath),
		date: toDate(/** @type {any} */ (data).date),
	};
}

/**
 * Ceiling on concurrent `file.data.get()` calls. One call per file over a
 * collection of thousands fails with `ERR_INSUFFICIENT_RESOURCES` — a net-stack
 * error, so each resolves to a request somewhere behind the editor API.
 */
const MATERIALISE_CONCURRENCY = 24;

/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight. Results
 * keep their input order.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} fn
 * @param {number} limit
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, fn, limit) {
	/** @type {R[]} */
	const results = new Array(items.length);
	let cursor = 0;

	const worker = async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await fn(items[index]);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	return results;
}

/** One `CloudCannon.collections()` call, keyed by name. @type {Promise<Map<string, any>> | null} */
let collectionIndexCache = null;

/** Materialised items, per collection name. @type {Map<string, Promise<any[]>>} */
const collectionItemsCache = new Map();

/** @type {Promise<Record<string, any>> | null} */
let collectionsCache = null;

/** @type {Array<{ target: any, event: "change" | "delete", handler: () => void }>} */
let collectionsSubscriptions = [];

/**
 * Enumerates the site's collections — one API call, cached — and subscribes to
 * `change`/`delete` on each so an edit drops the caches. Never calls
 * `collection.items()`: knowing the *names* is what lets the getters be
 * enumerable without fetching behind them.
 *
 * @returns {Promise<Map<string, any>>}
 */
function loadCollectionIndex() {
	if (!collectionIndexCache) {
		collectionIndexCache = (async () => {
			await apiLoadedPromise;
			const allCollections = await CloudCannon?.collections?.();

			/** @type {Map<string, any>} */
			const index = new Map();
			if (!allCollections?.length) return index;

			for (const collection of allCollections) {
				index.set(collection.collectionKey, collection);

				const handler = () => resetCollectionsCache();
				collection.addEventListener("change", handler);
				collection.addEventListener("delete", handler);
				collectionsSubscriptions.push(
					{ target: collection, event: "change", handler },
					{ target: collection, event: "delete", handler },
				);
			}
			return index;
		})();
	}
	return collectionIndexCache;
}

/**
 * Materialises one collection's files, memoised per name — the only place that
 * issues per-file requests. An unknown name is `[]`, matching 11ty.
 *
 * @param {string} key
 * @returns {Promise<any[]>}
 */
function loadCollectionItems(key) {
	let items = collectionItemsCache.get(key);
	if (!items) {
		items = (async () => {
			const collection = (await loadCollectionIndex()).get(key);
			if (!collection) return [];

			let files;
			try {
				files = await collection.items();
			} catch {
				return [];
			}
			return mapWithConcurrency(
				files,
				materialiseFile,
				MATERIALISE_CONCURRENCY,
			);
		})();
		collectionItemsCache.set(key, items);
	}
	return items;
}

/**
 * Builds (or returns cached) the `collections` object. Every key is a lazy
 * getter returning a `Promise` of its items, which LiquidJS awaits during
 * expression evaluation — so a component that never mentions `collections`
 * issues no per-file requests.
 *
 * Getters not a Proxy: LiquidJS probes `next` and `toLiquid` on every object
 * it resolves, and a blanket-getter Proxy answers those with a Promise, which
 * breaks the lookup entirely.
 *
 * @returns {Promise<Record<string, any>>}
 */
export function buildCollectionsData() {
	if (!collectionsCache) {
		collectionsCache = (async () => {
			const index = await loadCollectionIndex();

			/** @type {Record<string, any>} */
			const collections = {};
			for (const key of index.keys()) {
				Object.defineProperty(collections, key, {
					enumerable: true,
					configurable: true,
					get: () => loadCollectionItems(key),
				});
			}
			return collections;
		})();
	}
	return collectionsCache;
}

/** Clears every collections cache and tears down the invalidation listeners. */
export function resetCollectionsCache() {
	for (const { target, event, handler } of collectionsSubscriptions) {
		target.removeEventListener(event, handler);
	}
	collectionsSubscriptions = [];
	collectionIndexCache = null;
	collectionItemsCache.clear();
	collectionsCache = null;
}
