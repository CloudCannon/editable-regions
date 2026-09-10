/**
 * Bundle-path tests for the no-current-page case: when the CloudCannon API
 * reports no file for the open page, the session target is empty and the
 * renderer renders page-less — `page` binds to Hugo's empty page, so
 * components still render (with empty page context) instead of failing.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockFiles,
} from "../_mocks/cloudcannon";

/** Builds a mock API file from its front matter; only data.get() is used. */
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

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("the session renders page-less with an empty page context", async () => {
	const el = await window.cc_components?.["page-context"]({ title: "On None" });

	// The empty page has no title, params, section, or permalink (its divs
	// render nothing, and leading empty lines trim away); its date is the
	// zero time and it has no content. The props still come through.
	expect(lines(el)).toBe("0001-01-01\nlength=0\n\nOn None");
});
