import { beforeAll, expect, test } from "vitest";

import {
	type MockFile,
	setMockCollections,
	setMockFiles,
} from "../../_mocks/cloudcannon.js";

// Built bundle — run `npm run test:build-astro-svelte4-fixture` first.
import "../../_fixtures/astro-svelte4/dist/_astro/live-editing.js";

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

beforeAll(() => {
	setMockFiles([
		makeMockFile(
			"/src/content/blog/first-post.md",
			{ title: "First Test Post" },
			"First post body.\n",
		),
		makeMockFile(
			"/src/content/blog/second-post.md",
			{ title: "Second Test Post" },
			"Second post body.\n",
		),
	]);
	setMockCollections(["blog"]);
});

test("Astro 4 legacy collection entries use path-based IDs with the extension", async () => {
	const el = await window.cc_components?.["svelte4-collection"]({});
	const entries = el?.querySelectorAll(".collection-entry");

	expect(entries?.length).toBe(2);
	expect(entries?.[0]?.querySelector(".entry-id")?.textContent).toBe(
		"first-post.md",
	);
	expect(entries?.[0]?.querySelector(".entry-slug")?.textContent).toBe(
		"first-post",
	);
	expect(entries?.[0]?.querySelector(".entry-body")?.textContent).toBe(
		"First post body.",
	);
	expect(entries?.[0]?.querySelector(".entry-file-path")?.textContent).toBe("");
});
