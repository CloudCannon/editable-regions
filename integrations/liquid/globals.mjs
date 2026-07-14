// Builders for the `page` and `collections` globals on the shared Liquid
// engine. Both return Promises that LiquidJS awaits at the globals level;
// property access in templates is then synchronous on the resolved objects.

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
	const file = CloudCannon?.currentFile?.();
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

/** @type {Promise<Record<string, Array<any>>> | null} */
let collectionsCache = null;

/** @type {Array<{ target: any, event: "change" | "delete", handler: () => void }>} */
let collectionsSubscriptions = [];

/**
 * Builds (or returns cached) the `collections` object, keyed by collection
 * name. Subscribes to `change`/`delete` on each collection and drops the cache
 * when either fires, so edits during a session are picked up on the next render.
 *
 * @returns {Promise<Record<string, Array<any>>>}
 */
export function buildCollectionsData() {
	if (!collectionsCache) {
		collectionsCache = (async () => {
			await apiLoadedPromise;
			const allCollections = await CloudCannon?.collections?.();
			if (!allCollections?.length) return {};

			for (const collection of allCollections) {
				const handler = () => resetCollectionsCache();
				collection.addEventListener("change", handler);
				collection.addEventListener("delete", handler);
				collectionsSubscriptions.push(
					{ target: collection, event: "change", handler },
					{ target: collection, event: "delete", handler },
				);
			}

			const entries = await Promise.all(
				allCollections.map(async (collection) => {
					const key = collection.collectionKey;
					let files;
					try {
						files = await collection.items();
					} catch {
						return /** @type {[string, any[]]} */ ([key, []]);
					}
					const items = await Promise.all(files.map(materialiseFile));
					return /** @type {[string, any[]]} */ ([key, items]);
				}),
			);
			return Object.fromEntries(entries);
		})();
	}
	return collectionsCache;
}

/** Clears the collections cache and tears down its invalidation listeners. */
export function resetCollectionsCache() {
	for (const { target, event, handler } of collectionsSubscriptions) {
		target.removeEventListener(event, handler);
	}
	collectionsSubscriptions = [];
	collectionsCache = null;
}
