/**
 * Build-failure handling: a failed build must surface the underlying message,
 * must not leave the builder permanently dirty (so later renders don't re-run
 * the failing build), and must recover once the offending source is fixed.
 *
 * State is sequential — each case builds on the previous — so ordering matters.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderer,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

const siteFiles = {
	"cc-env": "production",
	"hugo.json": JSON.stringify({ title: "Build Recovery Fixture" }),
	"layouts/partials/card.html": '<p class="card">{{ .title }}</p>',
	"content/_index.md": "---\ntitle: Home\ndate: 2024-01-01\n---\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

test("the initial site builds and renders", async () => {
	// The first render triggers the initial full build (initHugoEditorSite only
	// loads config), so the builder has a site before the failure below.
	const { html, error } = await render("card.html", { title: "before" });
	expect(error).toBeUndefined();
	expect(html).toContain("before");
});

test("a build error surfaces the underlying message", async () => {
	// Invalid front matter on a content file fails the build.
	renderer().writeHugoFiles(
		JSON.stringify({ "content/broken.md": '---\ntitle: "unterminated\n---\n' }),
	);

	const { error } = await render("card.html", { title: "boom" });
	expect(error).toBeDefined();
	expect(error).toMatch(/broken\.md|yaml|unmarshal|parse/i);
});

test("a later render with no new changes does not re-run the failed build", async () => {
	// The failed build must not leave the builder dirty: with nothing new
	// pending, this render skips the build and serves the last good site.
	const { html, error } = await render("card.html", { title: "after" });
	expect(error).toBeUndefined();
	expect(html).toContain("after");
});

test("the site recovers once the offending source is fixed", async () => {
	renderer().writeHugoFiles(
		JSON.stringify({
			"content/broken.md": "---\ntitle: Fixed\ndate: 2024-01-02\n---\n",
		}),
	);

	const { html, error } = await render("card.html", { title: "recovered" });
	expect(error).toBeUndefined();
	expect(html).toContain("recovered");
});
