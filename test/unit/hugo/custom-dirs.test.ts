/**
 * Bundle-path tests for sites that configure custom directories. The fixture
 * (test/unit/_fixtures/hugo-custom-dirs) moves layoutDir to "templates",
 * dataDir to "custom-data", and contentDir to "notes" — like a real site
 * with non-default layout — and the integration must:
 *
 * - snapshot the template trees from the configured layout dir (partials,
 *   render hooks under _default/_markup, and shortcodes) by default;
 * - NOT snapshot kind layouts like _default/index.html (they'd shadow the
 *   renderer's dispatch layout);
 * - carry layoutDir/dataDir/contentDir in the config snapshot so the
 *   renderer resolves everything in the editor wasm site;
 * - still render components, shortcodes, render hooks, and site.Data from
 *   those relocated trees through the real WASM renderer.
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

/** The snapshot's data files, as shipped on cc_hugo_data. */
function snapshotData(): Record<string, string> {
	return (window as any).cc_hugo_data ?? {};
}

/** The snapshot's normalized site config on cc_hugo_config. */
function snapshotConfig(): Record<string, any> {
	return (window as any).cc_hugo_config ?? {};
}

// --- config passthrough ---

test("the config snapshot carries the site's configured directories", () => {
	const config = snapshotConfig();
	expect(config.layoutDir).toBe("templates");
	expect(config.dataDir).toBe("custom-data");
	expect(config.contentDir).toBe("notes");
});

// --- default walk of the configured layout dir ---

test("partials, render hooks, and shortcodes under the layout dir are snapshotted by default", () => {
	const files = snapshotFiles();
	expect(files["templates/partials/custom-static.html"]).toBeDefined();
	expect(files["templates/partials/custom-rich.html"]).toBeDefined();
	expect(files["templates/_default/_markup/render-link.html"]).toBeDefined();
	expect(files["templates/shortcodes/custom-shout.html"]).toBeDefined();
});

test("data from the configured data dir is snapshotted as site data", () => {
	expect(snapshotData()["custom-data/site_brand.yaml"]).toBeDefined();
});

test("kind layouts are not snapshotted (they would shadow the dispatch layout)", () => {
	// The production home template lives in the layout dir but must NOT be
	// bundled: the renderer installs its own `<layoutDir>/all.html` dispatch
	// layout, and any kind-specific layout would win the home lookup instead.
	expect(snapshotFiles()["templates/_default/index.html"]).toBeUndefined();
});

// --- rendering through the relocated trees ---

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

test("hugo.Data resolves from the custom data dir", async () => {
	const el = await window.cc_components?.["custom-rich"]({});

	expect(el?.querySelector(".rich .brand")?.textContent).toBe(
		"Custom Data Brand",
	);
});
