/**
 * Bundle-path tests for the home-page fallback: when the CloudCannon API
 * reports no current page at boot, the session target is the home page —
 * the editor site's always-on anchor (see home-page fallback in the handoff).
 * The home stub carries the site's real home front matter plus
 * build.render: always, so it renders under the cascade with real data.
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
// No current file: the runtime falls back to the home page as the target.
setMockCurrentFile(null);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("the session target falls back to the home page", async () => {
	const el = await window.cc_components?.["page-context"]({ title: "On Home" });

	// No props beyond the title, so the final prop-title line is the last; the
	// empty author/section lines come right after the title.
	expect(lines(el)).toBe(
		[
			"Home", // the loaded home front matter
			"", // no author on home
			"", // home has no section
			"/",
			"home",
			"2024-01-01", // the home stub's explicit date
			"length=0",
			"dark", // page.Params.theme survives on the home stub
			"On Home",
		].join("\n"),
	);
});
