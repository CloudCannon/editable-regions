/**
 * Builders for the `page` and `collections` globals exposed on the shared
 * Liquid engine. Both return Promises that LiquidJS awaits at the top-level
 * globals level; once resolved, all property access in templates is
 * synchronous on the plain objects.
 */

import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.mjs";
import { getPageMap, normalizeInputPath } from "./page-map.mjs";

/**
 * Snapshot of Eleventy build-time data needed to resolve `page.outputPath`.
 * Set via `setEleventyData` from `liquid/index.mjs`.
 *
 * @type {{ directories?: { output?: string } } | null}
 */
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
 * 11ty's default folder-style permalink: every input path becomes a URL with
 * a trailing slash, with `index` files mapping to the parent directory.
 * Last-resort fallback used by `resolveUrl` when neither a live front-matter
 * `permalink` nor the build-time page map gives us an answer.
 */
function deriveDefaultUrl(/** @type {string} */ inputPath) {
	const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
	const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
	const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
	return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

/**
 * Resolves the URL for an Eleventy input file. Priority:
 *
 *   1. Live front-matter `permalink` — wins so editor-time edits show
 *      immediately, before the user re-builds.
 *   2. Build-time page map (`registerPageMap`) — captures permalinks
 *      computed by JS config or `eleventyComputed`, which front-matter
 *      can't see.
 *   3. 11ty's folder-style default — last-resort derivation.
 */
function resolveUrl(
	/** @type {Record<string, any> | null | undefined} */ data,
	/** @type {string} */ inputPath,
) {
	const permalink = data?.permalink;
	if (typeof permalink === "string") return permalink;
	const mapped = getPageMap()[normalizeInputPath(inputPath)];
	if (mapped?.url) return mapped.url;
	return deriveDefaultUrl(inputPath);
}

/**
 * Same priority layering as `resolveUrl` but for the output path.
 * Returns `undefined` if we can't compose a path from available data.
 */
function resolveOutputPath(
	/** @type {Record<string, any> | null | undefined} */ data,
	/** @type {string} */ inputPath,
) {
	const outputDir = eleventyData?.directories?.output;
	const permalink = data?.permalink;
	if (typeof permalink === "string") {
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

/**
 * Coerces a raw front-matter date value into a Date. Returns `undefined`
 * for absent or unparseable input.
 */
function toDate(/** @type {unknown} */ raw) {
	if (!raw) return undefined;
	const d = new Date(/** @type {any} */ (raw));
	return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Joins an output directory and URL into an output path the way 11ty does:
 * URLs ending in `/` become `<dir><url>index.html`; other URLs are appended
 * as-is.
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
 * Materialises a single CC API file object into the 11ty collection-item
 * shape used in templates.
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
 * Builds the `page` object for the file currently open in the Visual Editor.
 *
 * Returns a Promise so that LiquidJS can await it at the top-level globals
 * level. Once resolved, all `{{ page.prop }}` accesses are synchronous on
 * the plain object — no Proxy tricks required.
 *
 * Called before every component render so that live front-matter edits
 * (e.g. changing `permalink` or `date`) are reflected immediately.
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

/**
 * Cached collections promise, reused across renders until invalidated by
 * a `change` or `delete` event on any collection.
 *
 * @type {Promise<Record<string, Array<any>>> | null}
 */
let collectionsCache = null;

/**
 * Active invalidation subscriptions to tear down when the cache is reset,
 * so we don't leak listeners across cache cycles.
 *
 * @type {Array<{ target: any, event: "change" | "delete", handler: () => void }>}
 */
let collectionsSubscriptions = [];

/**
 * Builds (or returns cached) the `collections` object for all CC collections.
 *
 * Returns a Promise resolving to `{ blog: [...], pages: [...], ... }` —
 * a plain object keyed by collection name. LiquidJS awaits the top-level
 * Promise, then `{% for post in collections.blog %}` and
 * `{{ collections.blog | getNewestCollectionItemDate }}` work via ordinary
 * synchronous property access on the resolved object.
 *
 * Subscribes to `change` and `delete` on each collection so adds/removes
 * during an editing session invalidate the cache automatically. Item-level
 * data edits (e.g. a post title changing) don't fire these events and
 * remain cached until the next add/remove or a manual reset.
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
