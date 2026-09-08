/**
 * Bundle-path tests for sites with custom directories: the fixture relocates
 * layoutDir to "templates", dataDir to "custom-data", and contentDir to
 * "notes". Relocated files are snapshotted at their physical paths (kind
 * layouts omitted so they can't shadow the dispatch layout), and the renderer
 * loads the captured hugo.toml natively so those dirs resolve.
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
} from "../_mocks/cloudcannon";

// Built fixture bundle — run `npm run test:build-hugo-custom-dirs` first.
useHugoFixture("hugo-custom-dirs");

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

// --- walk of the relocated layout dir --------------------------------------

test("templates under the relocated layout dir are snapshotted at their physical paths", () => {
	const files = snapshotFiles();
	expect(files["templates/partials/custom-static.html"]).toBeDefined();
	expect(files["templates/partials/custom-rich.html"]).toBeDefined();
	expect(files["templates/_default/_markup/render-link.html"]).toBeDefined();
	expect(files["templates/shortcodes/custom-shout.html"]).toBeDefined();
});

test("kind layouts are not snapshotted (the editor never executes them)", () => {
	// The editor only ever renders partials on demand via the renderer's
	// __cc-dispatch view, so page layouts would be dead weight — and a parse
	// error in one would break the editor's builds.
	expect(snapshotFiles()["templates/_default/index.html"]).toBeUndefined();
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

// --- relocated trees resolved through the snapshotted config ---------------

test("the snapshot carries the build-time environment", () => {
	expect((window as any).cc_hugo?.env).toBe("production");
});

test("the site config relocates the editor's content dir", async () => {
	// contentDir=notes comes from the snapshotted hugo.toml, so this notes post
	// is a real page in the editor tree — the session file is this exact path.
	const el = await window.cc_components?.["custom-page"]({});

	expect(el?.querySelector(".custom-page")?.textContent).toBe(
		"Hello Notes|/posts/hello/",
	);
});

test("datasets under the relocated data dir resolve via the relocated tree", async () => {
	// dataDir=custom-data comes from the snapshotted hugo.toml, so the mirrored
	// dataset file at custom-data/site_brand.yaml is read as site data (rendered
	// via hugo.Data.site_brand.site_brand).
	const el = await window.cc_components?.["custom-rich"]({});

	expect(el?.querySelector(".rich .brand")?.textContent).toBe(
		"Custom Data Brand",
	);
});
