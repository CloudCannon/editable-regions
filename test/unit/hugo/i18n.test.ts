/**
 * Bundle-path tests for i18n mirroring: the editor snapshot carries the site's
 * and the theme's translation files so `i18n` calls in captured partials
 * resolve instead of falling back to their keys; project translations shadow
 * theme translations, matching Hugo's lookup priority.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	setMockCollectionsList,
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
});

setMockCollectionsList([makeMockCollection("content", [home])]);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test("site i18n translations resolve in editor renders", async () => {
	const el = await window.cc_components?.["i18n-probe.html"]({});

	expect(el?.querySelector(".site-i18n")?.textContent).toBe("Site translation");
	expect(el?.querySelector(".site-i18n-arg")?.textContent).toBe("Hello world");
});

test("theme i18n translations resolve in editor renders", async () => {
	const el = await window.cc_components?.["i18n-probe.html"]({});

	expect(el?.querySelector(".theme-i18n")?.textContent).toBe(
		"Theme translation",
	);
});
