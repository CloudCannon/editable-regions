/**
 * Renderer tests for config mirroring: the browser mirrors the site's real
 * config files as JSON at their real paths (mirrorSiteConfig), and
 * learnSiteConfigDirs resolves them with Hugo's own config loading so the
 * editor's contentDir/dataDir match the site's. This file boots a site whose
 * mirrored root config (hugo.json — the JSON re-serialization of the site's
 * hugo.toml) relocates contentDir and dataDir, then checks that content
 * stubs, dataset files, render targets, the home-page fallback, and the home
 * delete guard all resolve through the learned dirs. Precedence between
 * mirrored candidates is covered by config-mirror-dirs.test.ts.
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
	"cc-editor.json": JSON.stringify({
		baseURL: "/",
		title: "Config mirror test",
		disableKinds: ["taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"],
		params: {},
		markup: { goldmark: { renderer: { unsafe: true } } },
	}),
	// The build-time environment the snapshot was emitted with; the mirrored
	// hugo.json below is the site's root config. No config/_default dir exists
	// here, so root-only resolution applies.
	"cc-env": "production",
	// JSON re-serialization of the site's hugo.toml: contentDir/dataDir moved
	// off their defaults; theme/module were already stripped by the mirror.
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
