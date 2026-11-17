// State is sequential — ordering matters.

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderer,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer.js";

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
	// The first render triggers the initial full build; initHugoEditorSite only loads config.
	const { html, error } = await render("card.html", { title: "before" });
	expect(error).toBeUndefined();
	expect(html).toContain("before");
});

test("a build error surfaces the underlying message", async () => {
	renderer().writeHugoFiles(
		JSON.stringify({ "content/broken.md": '---\ntitle: "unterminated\n---\n' }),
	);

	const { error } = await render("card.html", { title: "boom" });
	expect(error).toBeDefined();
	expect(error).toMatch(/broken\.md|yaml|unmarshal|parse/i);
});

test("a later render with no new changes does not re-run the failed build", async () => {
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
