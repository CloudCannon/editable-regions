/**
 * Renderer tests for config resolution: the site's config files are captured
 * verbatim and the renderer loads them natively (allconfig.LoadConfig +
 * editorFlags + IgnoreModuleDoesNotExist), so contentDir/dataDir come from the
 * site's own config. This file boots a site whose root config relocates
 * contentDir and dataDir, then pins that content stubs, dataset files, render
 * targets, and the home-page fallback all resolve through those dirs.
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
	// The build-time environment the snapshot was emitted with. No
	// config/_default dir exists here, so root-only resolution applies.
	"cc-env": "production",
	// The site's root config file, captured verbatim: contentDir/dataDir moved
	// off their defaults.
	"hugo.json": JSON.stringify({
		title: "Site Brand",
		contentDir: "notes",
		dataDir: "custom-data",
	}),
	"layouts/partials/pageprobe.html":
		'<p>{{ page.Title }}|{{ page.Params.cc_initialized | default "x" }}|{{ page.RelPermalink }}</p>',
	"layouts/partials/dataprobe.html": "<p>{{ site.Data.brand.brand }}</p>",
	// Content stubs mirrored before init, verbatim under the real paths —
	// the session-rendered stub is opted into publishing like the browser
	// would.
	"notes/_index.md": "---\ntitle: Home\ndate: 2024-01-01\n---\n",
	"notes/blog/one.md":
		"---\ntitle: Target One\nauthor: alice\nbuild:\n  render: always\n---\n",
	"custom-data/brand.yaml": "brand: Custom Data Brand\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

test("a render target under the learned contentDir resolves to that page's output", () => {
	const { html, error } = render("pageprobe.html", {}, "notes/blog/one.md");
	expect(error).toBeUndefined();
	expect(html).toContain("Target One|x|/blog/one/");
});

test("dataset files under the learned dataDir resolve via site.Data", () => {
	const { html, error } = render("dataprobe.html");
	expect(error).toBeUndefined();
	expect(html).toContain("Custom Data Brand");
});

test("with no target, renders fall back to the home page in the learned contentDir", () => {
	const { html, error } = render("pageprobe.html");
	expect(error).toBeUndefined();
	expect(html).toContain("Home|x|/");
});

test("removeHugoFiles refuses the home file in the learned contentDir", () => {
	const r = renderer();
	r.removeHugoFiles(JSON.stringify(["notes/_index.md"]));
	expect(
		r.readHugoFiles(JSON.stringify(["notes/_index.md"]))["notes/_index.md"],
	).toBeDefined();

	// A file outside the learned contentDir is NOT the editor's home — removal
	// is a plain no-op (the file was never written).
	r.removeHugoFiles(JSON.stringify(["content/_index.md"]));
	expect(
		r.readHugoFiles(JSON.stringify(["content/_index.md"]))["content/_index.md"],
	).toBeUndefined();
});
