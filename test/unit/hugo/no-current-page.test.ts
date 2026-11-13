import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	makeMockCollection,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockFiles,
} from "../_mocks/cloudcannon.js";

function mkFile(path: string, frontMatter: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(frontMatter) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

const home = mkFile("/content/_index.md", {
	title: "Home",
	date: "2024-01-01",
	theme: "dark",
});
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15",
});
const two = mkFile("/content/blog/two.md", {
	title: "Two",
	author: "bob",
	date: "2025-02-20",
});

const bootFiles = [home, one, two];
setMockFiles(bootFiles);
setMockCollectionsList([makeMockCollection("content", bootFiles)]);
setMockCurrentFile(null);

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("the session renders page-less with an empty page context", async () => {
	const el = await window.cc_components?.["page-context"]({ title: "On None" });

	expect(lines(el)).toBe("0001-01-01\nlength=0\n\nOn None");
});
