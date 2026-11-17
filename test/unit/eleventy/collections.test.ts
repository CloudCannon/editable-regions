import { beforeAll, beforeEach, expect, test } from "vitest";
import {
	buildCollectionsData,
	buildPageData,
	resetCollectionsCache,
} from "../../../integrations/liquid/globals.js";
import { registerPageMap } from "../../../integrations/liquid/page-map.js";
import { componentsReady } from "../_helpers/live-editing.js";
import {
	type MockCollection,
	type MockFile,
	resetMock,
	setMockCollectionsList,
	setMockCurrentFile,
} from "../_mocks/cloudcannon.js";

// Import side effect: wires the shared Liquid engine + builtins.
import "../_fixtures/eleventy/_site/register-components.js";

beforeAll(componentsReady);

function makeMockFile(
	path: string,
	data: Record<string, any> = {},
	content = "",
): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(content),
		content: { get: () => Promise.resolve(content) },
	};
}

function makeMockCollection(key: string, files: MockFile[]): MockCollection {
	return {
		collectionKey: key,
		items: () => Promise.resolve(files),
		addEventListener: () => {},
		removeEventListener: () => {},
	};
}

beforeAll(() => {
	resetCollectionsCache();
});

beforeEach(() => {
	resetMock();
	resetCollectionsCache();
});

test("buildCollectionsData returns collection items with the correct shape", async () => {
	const posts = [
		makeMockFile("src/posts/first.md", { title: "First", date: "2026-01-15" }),
		makeMockFile("src/posts/second.md", {
			title: "Second",
			date: "2026-02-20",
		}),
	];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	const items = await collections.posts;
	expect(items).toHaveLength(2);
	const first = items[0];
	expect(first.inputPath).toBe("src/posts/first.md");
	expect(first.data.title).toBe("First");
	expect(first.fileSlug).toBe("first");
	expect(first.filePathStem).toBe("/src/posts/first");
	expect(first.date).toBeInstanceOf(Date);
});

test("buildCollectionsData resolves URLs from the page map", async () => {
	registerPageMap({
		"src/posts/first.md": {
			url: "/posts/first/",
			outputPath: "_site/posts/first/index.html",
		},
	});

	const posts = [makeMockFile("src/posts/first.md", {})];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	const [first] = await collections.posts;
	expect(first.url).toBe("/posts/first/");
	expect(first.outputPath).toBe("_site/posts/first/index.html");
});

test("buildCollectionsData falls back to folder-style default URL when no permalink or page map entry", async () => {
	registerPageMap({});

	const posts = [makeMockFile("src/posts/first.md", {})];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	const [first] = await collections.posts;
	expect(first.url).toBe("/src/posts/first/");
});

test("buildCollectionsData uses a literal front-matter permalink when present", async () => {
	registerPageMap({});

	const posts = [
		makeMockFile("src/posts/custom.md", { permalink: "/custom-url/" }),
	];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	const [first] = await collections.posts;
	expect(first.url).toBe("/custom-url/");
});

test("buildPageData returns the page object for the current file", async () => {
	registerPageMap({
		"src/index.liquid": { url: "/", outputPath: "_site/index.html" },
	});
	setMockCurrentFile(
		makeMockFile("src/index.liquid", { title: "Home", date: "2026-04-21" }),
	);

	const page = await buildPageData();

	expect(page.inputPath).toBe("src/index.liquid");
	expect(page.fileSlug).toBe("index");
	expect(page.filePathStem).toBe("/src/index");
	expect(page.outputFileExtension).toBe("html");
	expect(page.url).toBe("/");
	expect(page.outputPath).toBe("_site/index.html");
	expect(page.date).toBeInstanceOf(Date);
});

test("buildPageData returns an empty object when no current file", async () => {
	setMockCurrentFile(null);

	const page = await buildPageData();

	expect(page).toEqual({});
});

test("resetCollectionsCache clears the cached collections", async () => {
	const posts = [makeMockFile("src/posts/first.md", { title: "First" })];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	await buildCollectionsData();
	resetCollectionsCache();

	setMockCollectionsList([
		makeMockCollection("posts", [
			makeMockFile("src/posts/first.md", { title: "Updated" }),
			makeMockFile("src/posts/second.md", { title: "Second" }),
		]),
	]);

	const collections = await buildCollectionsData();
	expect(await collections.posts).toHaveLength(2);
});

function makeCountedCollection(key: string, count: number) {
	const stats = { items: 0, gets: 0, inFlight: 0, peakInFlight: 0 };

	const files = Array.from({ length: count }, (_, i) => ({
		path: `src/${key}/${i}.md`,
		data: {
			get: async () => {
				stats.gets++;
				stats.inFlight++;
				stats.peakInFlight = Math.max(stats.peakInFlight, stats.inFlight);
				await Promise.resolve();
				stats.inFlight--;
				return { title: `${key} ${i}` };
			},
		},
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	}));

	const collection: MockCollection = {
		collectionKey: key,
		items: () => {
			stats.items++;
			return Promise.resolve(files as MockFile[]);
		},
		addEventListener: () => {},
		removeEventListener: () => {},
	};

	return { collection, stats };
}

test("a collection nobody reads is never fetched", async () => {
	const posts = makeCountedCollection("posts", 3);
	const pages = makeCountedCollection("pages", 3);
	setMockCollectionsList([posts.collection, pages.collection]);

	await buildCollectionsData();

	expect(posts.stats.items).toBe(0);
	expect(posts.stats.gets).toBe(0);
	expect(pages.stats.gets).toBe(0);
});

test("reading one collection does not fetch the others", async () => {
	const posts = makeCountedCollection("posts", 3);
	const pages = makeCountedCollection("pages", 5);
	setMockCollectionsList([posts.collection, pages.collection]);

	const collections = await buildCollectionsData();
	await collections.posts;

	expect(posts.stats.gets).toBe(3);
	expect(pages.stats.items).toBe(0);
	expect(pages.stats.gets).toBe(0);
});

test("collection keys are enumerable without fetching", async () => {
	// A Proxy would break key enumeration and confuse LiquidJS's `next`/`toLiquid` probing.
	const posts = makeCountedCollection("posts", 3);
	const pages = makeCountedCollection("pages", 3);
	setMockCollectionsList([posts.collection, pages.collection]);

	const collections = await buildCollectionsData();

	expect(Object.keys(collections).sort()).toEqual(["pages", "posts"]);
	expect(posts.stats.gets).toBe(0);
});

test("a collection is fetched once and memoised across reads", async () => {
	const posts = makeCountedCollection("posts", 4);
	setMockCollectionsList([posts.collection]);

	const collections = await buildCollectionsData();
	await collections.posts;
	await collections.posts;
	await (await buildCollectionsData()).posts;

	expect(posts.stats.items).toBe(1);
	expect(posts.stats.gets).toBe(4);
});

test("an unknown collection name has no getter and fetches nothing", async () => {
	const posts = makeCountedCollection("posts", 3);
	setMockCollectionsList([posts.collection]);

	const collections = await buildCollectionsData();

	expect(collections.nope).toBeUndefined();
	expect(posts.stats.gets).toBe(0);
});

test("file fetches are capped so they can't exhaust the connection pool", async () => {
	const posts = makeCountedCollection("posts", 200);
	setMockCollectionsList([posts.collection]);

	const collections = await buildCollectionsData();
	const items = await collections.posts;

	expect(items).toHaveLength(200);
	expect(posts.stats.peakInFlight).toBeLessThanOrEqual(24);
	expect(posts.stats.peakInFlight).toBeGreaterThan(1);
	expect(items[0].data.title).toBe("posts 0");
	expect(items[199].data.title).toBe("posts 199");
});

// Bundled runtime can't see `registerPageMap`, hence the literal permalink.
async function renderCollectionsDemo() {
	setMockCollectionsList([
		makeMockCollection("posts", [
			makeMockFile("src/posts/first.md", {
				title: "First",
				permalink: "/posts/first/",
			}),
			makeMockFile("src/posts/second.md", { title: "Second" }),
		]),
		makeMockCollection("pages", [
			makeMockFile("src/pages/about.md", { title: "About" }),
		]),
	]);

	return window.cc_components?.["collections-demo"]({});
}

test("a template reads collections without awaiting anything", async () => {
	const el = await renderCollectionsDemo();

	expect(el?.querySelector("[data-posts-size]")?.textContent).toBe("2");
	expect(el?.querySelector("[data-first-title]")?.textContent).toBe("First");
	expect(el?.querySelector("[data-first-url]")?.textContent).toBe(
		"/posts/first/",
	);
});

test("iterating a collection in a for loop resolves its items", async () => {
	const el = await renderCollectionsDemo();

	const titles = [...(el?.querySelectorAll("[data-post-item]") ?? [])].map(
		(li) => li.textContent,
	);
	expect(titles).toEqual(["First", "Second"]);
});

test("filters and dynamic keys work over a lazily-resolved collection", async () => {
	const el = await renderCollectionsDemo();

	expect(el?.querySelector("[data-dynamic-key]")?.textContent).toBe("First");
	expect(el?.querySelector("[data-filtered-size]")?.textContent).toBe("1");
	expect(el?.querySelector("[data-truthy]")?.textContent).toBe("yes");
});

test("an unknown collection renders as empty rather than erroring", async () => {
	const el = await renderCollectionsDemo();

	expect(el?.querySelector("[data-missing-size]")?.textContent).toBe("0");
});

test("a single collection serialises with the json filter", async () => {
	const el = await renderCollectionsDemo();

	const json = el?.querySelector("[data-single-json]")?.textContent ?? "";
	expect(JSON.parse(json)).toHaveLength(1);
	expect(JSON.parse(json)[0].data.title).toBe("About");
});
