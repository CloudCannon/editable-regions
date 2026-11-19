import type { CloudCannonVisualEditorAPIV1File } from "@cloudcannon/visual-editor-api";
import { slug as githubSlug } from "github-slugger";
import { CloudCannon } from "../../../helpers/cloudcannon.js";
import type { AstroCollectionsMode } from "./collections-mode.js";

type RenderResult = {
	Content: () => string;
	headings: any[];
	remarkPluginFrontmatter: any;
};

export type CollectionEntry = {
	collection: string;
	id: string;
	data: any;
	slug: string;
	body?: string;
	filePath?: string;
	render?: () => RenderResult;
};

declare const __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__:
	| AstroCollectionsMode
	| undefined;

const collectionsMode: AstroCollectionsMode =
	typeof __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__ === "undefined"
		? "content-layer"
		: __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__;

const CONTENT_EXTENSIONS =
	/\.(md|mdx|mdoc|markdown|mdown|mkdn|mkd|mdwn|mdtxt|mdtext|text)$/i;

const normalisePath = (path: string): string =>
	path.replace(/\\/g, "/").replace(/^\/+/, "");

const stripExtension = (path: string): string => path.replace(/\.[^./]*$/, "");

const slugifyEntryPath = (path: string): string =>
	stripExtension(path)
		.split("/")
		.map((segment) => githubSlug(segment))
		.join("/")
		.replace(/\/index$/, "");

const getFrontmatterSlug = (data: unknown): string | undefined => {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return undefined;
	}

	const slug = (data as Record<string, unknown>).slug;
	return slug ? String(slug) : undefined;
};

export const buildCollectionEntry = async (
	file: CloudCannonVisualEditorAPIV1File,
	collectionKey: string,
	mode: AstroCollectionsMode = collectionsMode,
): Promise<CollectionEntry> => {
	const data = (await file.data.get()) ?? {};
	const sourcePath = normalisePath(file.path);
	const collectionPrefix = `src/content/${collectionKey}/`;
	const relativePath = sourcePath.startsWith(collectionPrefix)
		? sourcePath.slice(collectionPrefix.length)
		: sourcePath;

	const isContentEntry = CONTENT_EXTENSIONS.test(relativePath);
	const frontmatterSlug = getFrontmatterSlug(data);
	const slug = frontmatterSlug ?? slugifyEntryPath(relativePath);

	let id: string;
	switch (mode) {
		case "legacy":
			id = isContentEntry ? relativePath : stripExtension(relativePath);
			break;
		case "legacy-compat":
			id = frontmatterSlug ?? relativePath;
			break;
		default:
			id = slug;
	}

	const entry: CollectionEntry = {
		collection: collectionKey,
		id,
		data,
		slug,
	};

	if (mode !== "legacy") {
		entry.filePath = sourcePath;
	}

	if (isContentEntry) {
		const body = (await file.content.get())?.trim();
		entry.body = body;
		entry.render = () => ({
			Content: () => body ?? "Content is not available when live editing",
			headings: [],
			remarkPluginFrontmatter: data ?? {},
		});
	}

	return entry;
};

export const getCollection = async (
	collectionKey: string,
	filter?: (value: any) => boolean,
): Promise<CollectionEntry[]> => {
	const collection = CloudCannon.collection(collectionKey);
	let files = await collection.items();
	if (files.length === 0) {
		const allFiles = await CloudCannon.files();
		files = allFiles.filter((file) =>
			normalisePath(file.path).startsWith(`src/content/${collectionKey}/`),
		);
	}

	const result = await Promise.all(
		files.map((file) => buildCollectionEntry(file, collectionKey)),
	);

	return filter ? result.filter(filter) : result;
};

export const getEntry = async (
	objOrString: string | { collection: string; slug?: string; id?: string },
	maybeString?: string,
) => {
	if (typeof objOrString === "object") {
		const {
			collection: collectionKey,
			slug: entrySlug,
			id: entryId,
		} = objOrString;
		const collection = await getCollection(collectionKey);
		if (entryId) {
			return collection.find(({ id }) => id === entryId);
		}
		if (entrySlug) {
			return collection.find(({ slug }) => slug === entrySlug);
		}
		return console.warn(
			"[CloudCannon] Failed to load entries, invalid arguments: ",
			[objOrString, maybeString],
		);
	}

	if (typeof objOrString === "string" && typeof maybeString === "string") {
		const [collectionKey, entryKey] = [objOrString, maybeString];
		const collection = await getCollection(collectionKey);

		return collection.find(
			({ id, slug }) => entryKey === id || entryKey === slug,
		);
	}

	return console.warn(
		"[CloudCannon] Failed to load entries, invalid arguments: ",
		[objOrString, maybeString],
	);
};

export const getEntries = (
	entries: { collection: string; slug?: string; id?: string }[],
) => {
	return Promise.all(entries.map((entry) => getEntry(entry)));
};

export const getEntryBySlug = (collection: string, slug: string) => {
	return getEntry({ collection, slug });
};

export const render = async (entry: any) => ({
	Content: () => entry?.body ?? "Content is not available when live editing",
	headings: [],
	remarkPluginFrontmatter: entry?.data ?? {},
});

export const defineCollection = () =>
	console.warn(
		"[CloudCannon] defineCollection is not supported in an editable component. Make sure you're not importing your config in a component file by mistake.",
	);
export const reference = () =>
	console.warn(
		"[CloudCannon] reference is not supported in an editable component. Make sure you're not importing your config in a component file by mistake.",
	);
