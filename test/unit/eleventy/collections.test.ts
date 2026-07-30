import { beforeAll, beforeEach, expect, test } from "vitest";

import {
	buildCollectionsData,
	buildPageData,
	resetCollectionsCache,
} from "../../../integrations/liquid/globals.mjs";
import { registerPageMap } from "../../../integrations/liquid/page-map.mjs";
import {
	type MockCollection,
	type MockFile,
	resetMock,
	setMockCollectionsList,
	setMockCurrentFile,
} from "../_mocks/cloudcannon";

// Import the built bundle to wire the shared Liquid engine + builtins.
import "../_fixtures/eleventy/_site/register-components.js";

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
	// Ensure clean collections state after the bundle import resolves apiLoadedPromise.
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

	expect(collections.posts).toHaveLength(2);
	const first = collections.posts[0];
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

	expect(collections.posts[0].url).toBe("/posts/first/");
	expect(collections.posts[0].outputPath).toBe("_site/posts/first/index.html");
});

test("buildCollectionsData falls back to folder-style default URL when no permalink or page map entry", async () => {
	registerPageMap({});

	const posts = [makeMockFile("src/posts/first.md", {})];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	// Default URL derived from the input path — `src/` is part of the path.
	expect(collections.posts[0].url).toBe("/src/posts/first/");
});

test("buildCollectionsData uses a literal front-matter permalink when present", async () => {
	registerPageMap({});

	const posts = [
		makeMockFile("src/posts/custom.md", { permalink: "/custom-url/" }),
	];
	setMockCollectionsList([makeMockCollection("posts", posts)]);

	const collections = await buildCollectionsData();

	expect(collections.posts[0].url).toBe("/custom-url/");
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

	// After reset, a new call should rebuild.
	setMockCollectionsList([
		makeMockCollection("posts", [
			makeMockFile("src/posts/first.md", { title: "Updated" }),
			makeMockFile("src/posts/second.md", { title: "Second" }),
		]),
	]);

	const collections = await buildCollectionsData();
	expect(collections.posts).toHaveLength(2);
});
