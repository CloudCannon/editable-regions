/**
 * Bundle-path tests for sites that configure custom directories. The fixture
 * (test/unit/_fixtures/hugo-custom-dirs) moves layoutDir to "templates",
 * dataDir to "custom-data", and contentDir to "notes" — like a real site
 * with non-default layout. The salient-folder walk (walk-project.html) is
 * layoutDir-agnostic, so it must discover the relocated template trees, key
 * them under the canonical layouts/ root the editor reads, and:
 *
 * - snapshot partials, render hooks under _default/_markup, and shortcodes;
 * - NOT snapshot kind layouts like _default/index.html (they'd shadow the
 *   renderer's dispatch layout);
 * - no longer forward layoutDir/dataDir/contentDir in the config snapshot
 *   (the editor always uses Hugo's defaults; content/data are mirrored from
 *   CloudCannon collections/datasets under the default dirs — relocated
 *   trees keep their segments until config mirroring lands, a documented
 *   first-pass gap);
 * - still render components, shortcodes, and render hooks from the relocated
 *   tree through the real WASM renderer.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
	useHugoFixture,
} from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-custom-dirs` first.
useHugoFixture("hugo-custom-dirs");
beforeAll(loadHugoBundle);

afterAll(restoreRendererStdout);

/** The snapshot's template files, as shipped on cc_hugo_files. */
function snapshotFiles(): Record<string, string> {
	return (window as any).cc_hugo_files ?? {};
}

/** The snapshot's normalized site config on cc_hugo_config. */
function snapshotConfig(): Record<string, any> {
	return (window as any).cc_hugo_config ?? {};
}

// --- config churn ----------------------------------------------------------

test("the config snapshot no longer forwards directory keys", () => {
	const config = snapshotConfig();
	expect(config.layoutDir).toBeUndefined();
	expect(config.dataDir).toBeUndefined();
	expect(config.contentDir).toBeUndefined();
});

// --- default walk of the configured layout dir -----------------------------

test("templates under the relocated layout dir are snapshotted under canonical layouts/ keys", () => {
	const files = snapshotFiles();
	expect(files["layouts/partials/custom-static.html"]).toBeDefined();
	expect(files["layouts/partials/custom-rich.html"]).toBeDefined();
	expect(files["layouts/_default/_markup/render-link.html"]).toBeDefined();
	expect(files["layouts/shortcodes/custom-shout.html"]).toBeDefined();
});

test("kind layouts are not snapshotted (they would shadow the dispatch layout)", () => {
	// The production home template lives in the relocated layout dir but must
	// NOT be bundled: the renderer installs its own `<layoutDir>/all.html`
	// dispatch layout, and any kind-specific layout would win the home lookup.
	expect(snapshotFiles()["layouts/_default/index.html"]).toBeUndefined();
});

// --- rendering through the relocated trees ---------------------------------

test("a component from the custom layout dir renders", async () => {
	const el = await window.cc_components?.["custom-static"]({});

	expect(el?.querySelector(".custom-static")?.textContent).toBe(
		"hello from custom dirs",
	);
});

test("a shortcode from the custom shortcodes dir expands in component markdown", async () => {
	const el = await window.cc_components?.["custom-rich"]({
		body: "Here is {{< custom-shout >}}loud{{< /custom-shout >}}.",
	});

	expect(el?.querySelector(".rich .shout")?.textContent).toContain(
		"Here is SHOUT:[=loud=].",
	);
});

test("a render hook from the custom _markup dir applies to component markdownify", async () => {
	const el = await window.cc_components?.["custom-rich"]({});

	expect(el?.querySelector(".rich .link")?.textContent).toBe(
		"HOOK:[docs → https://example.com/]",
	);
});
