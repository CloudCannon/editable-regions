/**
 * Template capture from the site's themes (themes/proot) and vendored module
 * imports (example.com/cc-fixture-vendor, hand-vendored in _vendor/):
 * components whose partials live there resolve and render in the editor.
 *
 * The snapshot merges those trees UNDER the project's own files — a project
 * partial shadows a theme partial with the same name, matching Hugo's lookup
 * priority. Kind layouts stay out so the renderer's dispatch layout is never
 * shadowed.
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
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15",
});

// Content is mirrored from collections at boot; these templates-only tests
// render probes through the home stub.
setMockCollectionsList([makeMockCollection("content", [home, one])]);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one line; strip tags, keep the text. */
function text(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

async function render(key: string, props: Record<string, any> = {}) {
	return window.cc_components?.[key]?.(props);
}

test("a component partial provided by a theme renders", async () => {
	const el = await render("themed-hero");
	expect(text(el)).toBe("themed-hero-from-proot");
});

test("nested partial includes resolve across the theme tree", async () => {
	const el = await render("themed-outer");
	expect(text(el)).toContain("themed-inner-from-proot");
});

test("a project partial shadows a theme partial with the same name", async () => {
	// Both the project and the theme define partials/dupe.html; Hugo's lookup
	// priority is captured into the snapshot.
	const el = await render("dupe");
	expect(text(el)).toBe("from-project");
	expect(text(el)).not.toContain("from-theme-proot");
});

test("a shortcode from a theme expands inside component markdown", async () => {
	const el = await render("theme-shout", {
		body: "Here is {{< themed-shout >}}loud{{< /themed-shout >}}.",
	});
	expect(text(el)).toContain("theme-shout-probe");
	expect(text(el)).toContain("Here is THEME-SHOUT:[=loud=]");
});

test("a render hook from a theme applies to component markdownify", async () => {
	const el = await render("theme-hook");
	expect(text(el)).toBe(
		"theme-hook-probe: THEME-HOOK:[docs → https://example.com/]",
	);
});

test("a component partial from a vendored module renders", async () => {
	const el = await render("vendored-card");
	expect(text(el)).toBe("vendored-from-module");
});

test("vendored module data and i18n mounts render, and unmounted theme data", async () => {
	const el = await render("vendor-mounts-probe");
	// The vendored module declares data/i18n mounts (vendordata/, vendori18n/);
	// the theme contributes its implicit data/ tree without mounts.
	expect(el?.querySelector(".vendor-data")?.textContent).toBe(
		"from-vendor-data",
	);
	expect(el?.querySelector(".vendor-i18n")?.textContent).toBe(
		"Vendored translation",
	);
	expect(el?.querySelector(".theme-data")?.textContent).toBe("from-theme-data");
});
