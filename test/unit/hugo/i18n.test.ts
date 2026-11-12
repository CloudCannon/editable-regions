import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	makeMockCollection,
	setMockCollectionsList,
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
});

setMockCollectionsList([makeMockCollection("content", [home])]);

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
