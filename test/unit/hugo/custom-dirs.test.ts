/** The fixture relocates layoutDir/dataDir/contentDir; relocated files are snapshotted at physical paths. */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
	useHugoFixture,
} from "../_helpers/hugo-bundle.js";
import {
	makeMockCollection,
	makeMockDataset,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockDatasetsList,
} from "../_mocks/cloudcannon.js";

// Built fixture bundle — run `npm run test:build-hugo-custom-dirs` first.
useHugoFixture("hugo-custom-dirs");

const home = { title: "Custom Dirs Fixture", date: "2024-01-01" };
const hello = { title: "Hello Notes", date: "2025-06-01" };

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
setMockCurrentFile(notesFiles[1]);

beforeAll(loadHugoBundle);

afterAll(restoreRendererStdout);

function snapshotFiles(): Record<string, string> {
	return (window as any).cc_hugo_files ?? {};
}

test("templates under the relocated layout dir are snapshotted at their physical paths", () => {
	const files = snapshotFiles();
	expect(files["templates/partials/custom-static.html"]).toBeDefined();
	expect(files["templates/partials/custom-rich.html"]).toBeDefined();
	expect(files["templates/_default/_markup/render-link.html"]).toBeDefined();
	expect(files["templates/shortcodes/custom-shout.html"]).toBeDefined();
});

test("kind layouts are not snapshotted (the editor never executes them)", () => {
	// The editor only renders partials on demand, and a parse error in a kind layout would break its builds.
	expect(snapshotFiles()["templates/_default/index.html"]).toBeUndefined();
});

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

test("the snapshot carries the build-time environment", () => {
	expect((window as any).cc_hugo?.env).toBe("production");
});

test("the site config relocates the editor's content dir", async () => {
	const el = await window.cc_components?.["custom-page"]({});

	expect(el?.querySelector(".custom-page")?.textContent).toBe(
		"Hello Notes|/posts/hello/",
	);
});

test("datasets under the relocated data dir resolve via the relocated tree", async () => {
	const el = await window.cc_components?.["custom-rich"]({});

	expect(el?.querySelector(".rich .brand")?.textContent).toBe(
		"Custom Data Brand",
	);
});
