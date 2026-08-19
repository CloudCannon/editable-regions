/**
 * Bundle-path tests for template capture from the site's themes and vendored
 * modules (walk-modules.html): components whose partials live in a theme
 * (themes/proot) or a vendored module import (example.com/cc-fixture-vendor,
 * hand-vendored in _vendor/) resolve and render in the editor.
 *
 * The snapshot walks those trees into logical layout paths and merges them
 * UNDER the project's own files — a project partial shadows a theme partial
 * with the same name, matching Hugo's lookup priority. Kind layouts stay out
 * so the renderer's dispatch layout is never shadowed.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	setMockCollectionsList,
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
});
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15",
});

// The site config mirrors from CloudCannon (mirrorSiteConfig) — the fixture's
// config.toml parsed to an object, as the real API returns it. It carries the
// theme (proot) and the vendored module import; the self-import is what
// mirrorSiteConfig strips.
const configToml = mkFile("/config.toml", {
	baseURL: "/",
	title: "Hugo Unit Fixture",
	theme: "proot",
	module: {
		replacements: "github.com/cloudcannon/editables -> ../../../../..",
		imports: [
			{ path: "github.com/cloudcannon/editables" },
			{ path: "example.com/cc-fixture-vendor" },
		],
	},
});

// The site's own config files, mirrored at boot (plus the content collection).
setMockFiles([configToml]);
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
	// Both layouts/partials/dupe.html (project: "from-project") and
	// themes/proot/layouts/partials/dupe.html ("from-theme-proot") exist;
	// Hugo's lookup priority is captured into the snapshot.
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
