import type { CloudCannonVisualEditorAPIV1File } from "@cloudcannon/visual-editor-api";
import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.js";
import { getPageMap, normalizeInputPath } from "./page-map.js";

type EleventyData = { directories?: { output?: string } } | null;

interface CollectionItem {
	url: string;
	outputPath: string | undefined;
	inputPath: string;
	fileSlug: string;
	filePathStem: string;
	date: Date | undefined;
	data: any;
}

interface CollectionsSubscription {
	target: any;
	event: "change" | "delete";
	handler: () => void;
}

let eleventyData: EleventyData = null;

export function setEleventyData(data: EleventyData): void {
	eleventyData = data;
}

function stripExtension(p: string): string {
	return p.replace(/\.[^./]+$/, "");
}

function deriveDefaultUrl(inputPath: string): string {
	const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
	const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
	const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
	return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

function literalPermalink(
	data: Record<string, any> | null | undefined,
): string | undefined {
	const permalink = data?.permalink;
	if (typeof permalink !== "string") return undefined;
	if (permalink.includes("{{") || permalink.includes("{%")) return undefined;
	return permalink;
}

function resolveUrl(
	data: Record<string, any> | null | undefined,
	inputPath: string,
): string {
	const permalink = literalPermalink(data);
	if (permalink) return permalink;
	const mapped = getPageMap()[normalizeInputPath(inputPath)];
	if (mapped?.url) return mapped.url;
	return deriveDefaultUrl(inputPath);
}

function resolveOutputPath(
	data: Record<string, any> | null | undefined,
	inputPath: string,
): string | undefined {
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

function deriveFileSlug(inputPath: string): string {
	const base = inputPath.split("/").pop() ?? "";
	return stripExtension(base);
}

function deriveFilePathStem(inputPath: string): string {
	const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
	return stem.startsWith("/") ? stem : `/${stem}`;
}

function toDate(raw: unknown): Date | undefined {
	if (!raw) return undefined;
	const d = new Date(raw as string | number | Date);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

function joinOutputPath(outputDir: string, url: string): string {
	const dir = outputDir.replace(/\/+$/, "");
	const tail = url.endsWith("/") ? `${url}index.html` : url;
	return `${dir}${tail}`;
}

async function materialiseFile(
	file: CloudCannonVisualEditorAPIV1File,
): Promise<CollectionItem> {
	const data = ((await file.data.get()) ?? {}) as Record<string, any>;
	return {
		url: resolveUrl(data, file.path),
		outputPath: resolveOutputPath(data, file.path),
		inputPath: file.path,
		fileSlug: deriveFileSlug(file.path),
		filePathStem: deriveFilePathStem(file.path),
		date: toDate(data.date),
		data,
	};
}

export async function buildPageData(): Promise<Record<string, any>> {
	await apiLoadedPromise;
	let file: CloudCannonVisualEditorAPIV1File | undefined;
	try {
		file = CloudCannon?.currentFile?.();
	} catch {
		return {};
	}
	if (!file) return {};
	const inputPath = file.path;
	const data = ((await file.data.get()) ?? {}) as Record<string, any>;
	return {
		inputPath,
		fileSlug: deriveFileSlug(inputPath),
		filePathStem: deriveFilePathStem(inputPath),
		outputFileExtension: "html",
		url: resolveUrl(data, inputPath),
		outputPath: resolveOutputPath(data, inputPath),
		date: toDate(data.date),
	};
}

// One per-file request over thousands fails with ERR_INSUFFICIENT_RESOURCES.
const MATERIALISE_CONCURRENCY = 24;

async function mapWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	limit: number,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;

	const worker = async (): Promise<void> => {
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

let collectionIndexCache: Promise<Map<string, any>> | null = null;

const collectionItemsCache = new Map<string, Promise<CollectionItem[]>>();

let collectionsCache: Promise<Record<string, any>> | null = null;

let collectionsSubscriptions: CollectionsSubscription[] = [];

// Never calls collection.items(); only the names are needed for lazy getters.
function loadCollectionIndex(): Promise<Map<string, any>> {
	if (!collectionIndexCache) {
		collectionIndexCache = (async () => {
			await apiLoadedPromise;
			const allCollections = await CloudCannon?.collections?.();

			const index = new Map<string, any>();
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

function loadCollectionItems(key: string): Promise<CollectionItem[]> {
	let items = collectionItemsCache.get(key);
	if (!items) {
		items = (async () => {
			const collection = (await loadCollectionIndex()).get(key);
			if (!collection) return [];

			let files: CloudCannonVisualEditorAPIV1File[];
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

// Getters not a Proxy: LiquidJS probes next/toLiquid, which a blanket-getter Proxy breaks.
export function buildCollectionsData(): Promise<Record<string, any>> {
	if (!collectionsCache) {
		collectionsCache = (async () => {
			const index = await loadCollectionIndex();

			const collections: Record<string, any> = {};
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

export function resetCollectionsCache(): void {
	for (const { target, event, handler } of collectionsSubscriptions) {
		target.removeEventListener(event, handler);
	}
	collectionsSubscriptions = [];
	collectionIndexCache = null;
	collectionItemsCache.clear();
	collectionsCache = null;
}
