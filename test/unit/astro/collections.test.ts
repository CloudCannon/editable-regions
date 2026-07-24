import { beforeAll, expect, test } from "vitest";

import {
	type MockFile,
	setMockCollections,
	setMockFiles,
} from "../_mocks/cloudcannon";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

function makeMockFile(
	path: string,
	data: Record<string, any>,
	content = "",
): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(content),
		content: { get: () => Promise.resolve(content) },
	};
}

const mockFiles: MockFile[] = [
	makeMockFile("/src/content/blog/first-post.md", {
		title: "First Test Post",
		description: "This is the first test post",
		pubDate: "2024-01-15",
	}),
	makeMockFile("/src/content/blog/second-post.md", {
		title: "Second Test Post",
		description: "This is the second test post",
		pubDate: "2024-01-20",
		draft: false,
	}),
	makeMockFile("/src/content/news/latest-update.md", {
		title: "Latest Update",
		description: "A news item in a non-configured folder",
		pubDate: "2024-02-01",
	}),
];

beforeAll(() => {
	setMockFiles(mockFiles);
	setMockCollections(["blog"]);
});

test("a component loads collection entries through the astro:content shim", async () => {
	const el = await window.cc_components?.["astro-collection"]({});

	expect(el?.querySelector(".collection-list")).toBeTruthy();
	expect(el?.querySelector(".collection-list p")?.textContent).toContain(
		'Found 2 entries in "blog"',
	);
});

test("collection entries expose their frontmatter data and slug", async () => {
	const el = await window.cc_components?.["astro-collection"]({});

	const entries = el?.querySelectorAll(".collection-entry");
	expect(entries?.length).toBe(2);

	const first = entries?.[0];
	expect(first?.querySelector(".entry-title")?.textContent).toBe(
		"First Test Post",
	);
	expect(first?.querySelector(".entry-slug")?.textContent).toBe("first-post");
});

test("the collection name prop selects which collection to load", async () => {
	const el = await window.cc_components?.["astro-collection"]({
		collectionName: "blog",
	});

	expect(el?.querySelector(".collection-list p")?.textContent).toContain(
		'"blog"',
	);
});

test("an unknown collection yields zero entries without crashing", async () => {
	const el = await window.cc_components?.["astro-collection"]({
		collectionName: "nonexistent",
	});

	expect(el?.querySelector(".collection-list")).toBeTruthy();
	expect(el?.querySelector(".collection-list p")?.textContent).toContain(
		'Found 0 entries in "nonexistent"',
	);
	expect(el?.querySelectorAll(".collection-entry")?.length).toBe(0);
});

test("a non-configured collection falls back to matching files by folder path", async () => {
	// Non-configured collections fall back to matching files by folder path.
	const el = await window.cc_components?.["astro-collection"]({
		collectionName: "news",
	});

	expect(el?.querySelector(".collection-list")).toBeTruthy();
	expect(el?.querySelector(".collection-list p")?.textContent).toContain(
		'Found 1 entries in "news"',
	);

	const entry = el?.querySelector(".collection-entry");
	expect(entry?.querySelector(".entry-title")?.textContent).toBe(
		"Latest Update",
	);
	expect(entry?.querySelector(".entry-slug")?.textContent).toBe(
		"latest-update",
	);
});

test("the rendered collection list matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-collection"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
