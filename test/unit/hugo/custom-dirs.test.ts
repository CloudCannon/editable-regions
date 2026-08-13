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
 * - no longer forward layoutDir/dataDir/contentDir in the config snapshot;
 * - mirror the site's hugo.toml as JSON at its real path (now that config
 *   mirroring has landed), so the renderer learns contentDir=notes and
 *   dataDir=custom-data natively and the relocated collections/datasets
 *   resolve through them;
 * - still render components, shortcodes, and render hooks from the relocated
 *   tree through the real WASM renderer.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
	useHugoFixture,
} from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	makeMockDataset,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockDatasetsList,
	setMockFiles,
} from "../_mocks/cloudcannon";

// Built fixture bundle — run `npm run test:build-hugo-custom-dirs` first.
useHugoFixture("hugo-custom-dirs");

/**
 * The fixture's hugo.toml as the CloudCannon API would parse it: baseURL,
 * titles, locale and the relocated directories are present, and its module
 * block is stripped by the runtime's config mirroring (the editor never
 * resolves modules). Mirrored as hugo.json at the site root; the renderer
 * reads contentDir/dataDir straight off Hugo's own resolution of it.
 */
const fixtureConfig = {
	baseURL: "/",
	title: "Hugo Custom Dirs Fixture",
	languageCode: "en-AU",
	layoutDir: "templates",
	dataDir: "custom-data",
	contentDir: "notes",
	theme: "", // stripped by the mirror regardless
	module: { imports: [] }, // stripped by the mirror regardless
	params: { brand: "Custom Dirs Brand" },
};

/** @type {MockFile} */
const configFile = {
	path: "/hugo.toml",
	data: { get: () => Promise.resolve(fixtureConfig) },
	get: () => Promise.resolve(""),
	content: { get: () => Promise.resolve("") },
};

const home = { title: "Custom Dirs Fixture", date: "2024-01-01" };
const hello = { title: "Hello Notes", date: "2025-06-01" };

/** @type {MockFile[]} */
const notesFiles = [
	{ path: "/notes/_index.md", data: { get: () => Promise.resolve(home) } },
	{
		path: "/notes/posts/hello.md",
		data: { get: () => Promise.resolve(hello) },
	},
].map((f) => ({
	...f,
	get: () => Promise.resolve(""),
	content: { get: () => Promise.resolve("") },
}));

setMockFiles([configFile, ...notesFiles]);
setMockCollectionsList([makeMockCollection("notes", notesFiles)]);
setMockDatasetsList([
	makeMockDataset("site_brand", {
		path: "/custom-data/site_brand.yaml",
		data: { get: () => Promise.resolve({ site_brand: "Custom Data Brand" }) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	}),
]);
// The page being edited: a notes post, whose stub the runtime opts into
// publishing and which drives the render target under the learned content dir.
setMockCurrentFile(notesFiles[1]);

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

// --- config mirroring through the relocated trees --------------------------

test("the snapshot carries the build-time environment for config mirroring", () => {
	expect((window as any).cc_hugo?.env).toBe("production");
});

test("the mirrored site config relocates the editor's content dir", async () => {
	// contentDir=notes was learned from the mirrored hugo.json, so this
	// notes post is a real page in the editor tree and the render target
	// resolves to it — the session file is this exact path.
	const el = await window.cc_components?.["custom-page"]({});

	expect(el?.querySelector(".custom-page")?.textContent).toBe(
		"Hello Notes|/posts/hello/",
	);
});

test("datasets under the learned data dir resolve via the relocated tree", async () => {
	// dataDir=custom-data was learned from the mirrored hugo.json, so the
	// mirrored dataset file at custom-data/site_brand.yaml is read as site
	// data. custom-rich renders hugo.Data.site_brand.site_brand.
	const el = await window.cc_components?.["custom-rich"]({});

	expect(el?.querySelector(".rich .brand")?.textContent).toBe(
		"Custom Data Brand",
	);
});
