/**
 * Renderer tests for config precedence among mirrored candidates: the renderer
 * loads every captured config file natively, so the effective contentDir is
 * whatever Hugo's own resolution produces — config/_default merges over the
 * root candidate, and within the root the hugo-named candidate beats the
 * config-named one. These tests pin the outcome without re-implementing Hugo's
 * rules.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

/** The snapshot the browser runtime would feed the renderer at startup. */
const siteFiles = {
	"cc-editor.json": JSON.stringify({
		baseURL: "/",
		title: "Config mirror precedence test",
		disableKinds: ["taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"],
		params: {},
		markup: { goldmark: { renderer: { unsafe: true } } },
	}),
	"cc-env": "production",
	// Both root candidates present: hugo.* wins the root slot.
	"hugo.json": JSON.stringify({ contentDir: "hdir" }),
	"config.json": JSON.stringify({ contentDir: "cdir" }),
	// The config dir merges over the root candidate, so this wins overall.
	"config/_default/config.json": JSON.stringify({ contentDir: "dirnotes" }),
	"layouts/partials/pageprobe.html":
		'<p>{{ page.Title }}|{{ page.Params.cc_initialized | default "x" }}|{{ page.RelPermalink }}</p>',
	// Content stubs mirrored before init at the dir-resolved contentDir.
	"dirnotes/_index.md": "---\ntitle: Home\ndate: 2024-01-01\n---\n",
	"dirnotes/blog/one.md":
		"---\ntitle: Dir One\nauthor: alice\nbuild:\n  render: always\n---\n",
	// A stub under a root-candidate dir that must NOT have won.
	"hdir/blog/two.md": "---\ntitle: Root Two\n---\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

test("the config dir's contentDir wins over the root candidates (natively resolved)", () => {
	const { html, error } = render("pageprobe.html", {}, "dirnotes/blog/one.md");
	expect(error).toBeUndefined();
	expect(html).toContain("Dir One|x|/blog/one/");
});

test("content outside the winning contentDir matches no page and falls back to home", () => {
	// hdir lost the root slot (hugo.* beats config.*) and the dir lost to the
	// config dir, so "hdir/blog/two.md" is not under the editor's contentDir —
	// the render falls back to the home page rather than resolving a page.
	const { html, error } = render("pageprobe.html", {}, "hdir/blog/two.md");
	expect(error).toBeUndefined();
	expect(html).toContain("Home|x|/");
});
