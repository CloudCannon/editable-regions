/**
 * Renderer tests for config resolution: the renderer loads the site's captured
 * config files natively (allconfig.LoadConfig + editorFlags +
 * IgnoreModuleDoesNotExist), so contentDir/dataDir come from the site's own
 * config. Boots a root config that relocates both dirs, then pins content
 * stubs, dataset files, render targets, and the home-page fallback to those
 * dirs.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderer,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

/** The snapshot the browser runtime would feed the renderer at startup. */
const siteFiles = {
	// No config/_default dir exists here, so root-only resolution applies.
	"cc-env": "production",
	// Captured verbatim: contentDir/dataDir moved off their defaults.
	"hugo.json": JSON.stringify({
		title: "Site Brand",
		contentDir: "notes",
		dataDir: "custom-data",
	}),
	"layouts/partials/pageprobe.html":
		'<p>{{ page.Title }}|{{ page.Params.cc_initialized | default "x" }}|{{ page.RelPermalink }}</p>',
	"layouts/partials/dataprobe.html": "<p>{{ site.Data.brand.brand }}</p>",
	// Content stubs mirrored before init.
	"notes/_index.md": "---\ntitle: Home\ndate: 2024-01-01\n---\n",
	"notes/blog/one.md": "---\ntitle: Target One\nauthor: alice\n---\n",
	"custom-data/brand.yaml": "brand: Custom Data Brand\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

test("a render target under the learned contentDir resolves to that page's output", async () => {
	const { html, error } = await render(
		"pageprobe.html",
		{},
		"notes/blog/one.md",
	);
	expect(error).toBeUndefined();
	expect(html).toContain("Target One|x|/blog/one/");
});

test("dataset files under the learned dataDir resolve via site.Data", async () => {
	const { html, error } = await render("dataprobe.html");
	expect(error).toBeUndefined();
	expect(html).toContain("Custom Data Brand");
});

test("with no target, renders with an empty page context", async () => {
	const { html, error } = await render("pageprobe.html");
	expect(error).toBeUndefined();
	expect(html).toContain("|x|");
});

test("removeHugoFiles deletes content files plainly", async () => {
	const r = renderer();
	r.removeHugoFiles(JSON.stringify(["notes/blog/one.md"]));
	expect(
		r.readHugoFiles(JSON.stringify(["notes/blog/one.md"]))["notes/blog/one.md"],
	).toBeUndefined();

	// A file outside any written path is a plain no-op.
	r.removeHugoFiles(JSON.stringify(["content/_index.md"]));
	expect(
		r.readHugoFiles(JSON.stringify(["content/_index.md"]))["content/_index.md"],
	).toBeUndefined();
});
