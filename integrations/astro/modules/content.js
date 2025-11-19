import { CloudCannon } from "../../../helpers/cloudcannon.mjs";

/**
 * @param {string} collectionKey
 * @param {(value: any) => boolean} [filter]
 * @returns {Promise<Array<any>>}
 */
export const getCollection = async (collectionKey, filter) => {
	const collection = CloudCannon.collection(collectionKey);
	let files = await collection.items();
	if (files.length === 0) {
		const allFiles = await CloudCannon.files();
		files = allFiles.filter((file) =>
			file.path.startsWith(`/src/content/${collectionKey}/`),
		);
	}

	const promises = files.map(async (file) => {
		const data = await file.data.get();
		let id = file.path.replace(`/src/content/${collectionKey}/`, "");
		let slug = id.replace(/\.[^.]*$/, "");
		if (!id.match(/\.md(x|oc)?$/)) {
			id = slug;
		}
		if (data && "slug" in data) {
			slug = data.slug;
		}

		return {
			collection: collectionKey,
			id: id,
			data: data,
			slug: slug,
			body: await file.get(),
		};
	});

	const result = await Promise.all(promises);

	return filter ? result.filter(filter) : result;
};

/**
 *
 * @param {string | {collection: string, slug?: string, id?: string}} objOrString
 * @param {string} [maybeString]
 * @returns
 */
export const getEntry = async (objOrString, maybeString) => {
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

		return collection.find(({ id, slug }) => entryKey === (slug ?? id));
	}

	return console.warn(
		"[CloudCannon] Failed to load entries, invalid arguments: ",
		[objOrString, maybeString],
	);
};

/**
 * @param {{collection: string, slug?: string, id?: string}[]} entries
 * @returns
 */
export const getEntries = (entries) => {
	return Promise.all(entries.map((entry) => getEntry(entry)));
};

/**
 * @param {string} collection
 * @param {string} slug
 * @returns
 */
export const getEntryBySlug = (collection, slug) => {
	return getEntry({ collection, slug });
};

/**
 * @param {any} entry
 * @returns
 */
export const render = async (entry) => ({
	Content: () => entry?.body ?? "Content is not available when live editing",
	headings: [],
	remarkPluginFrontmatter: {},
});

export const defineCollection = () =>
	console.warn(
		"[CloudCannon] defineCollection is not supported in an editable component. Make sure you're not importing your config in a component file by mistake.",
	);
export const reference = () =>
	console.warn(
		"[CloudCannon] reference is not supported in an editable component. Make sure you're not importing your config in a component file by mistake.",
	);
