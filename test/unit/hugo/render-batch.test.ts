/**
 * Batched renders: one renderHugoPartials call renders every queued request —
 * all sharing the session's target page — in a single view render, keying
 * each output in a <div data-cc-render="{id}"> wrapper so the browser can
 * demultiplex the combined string back into per-call elements.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	renderBatch,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

/** The snapshot the browser runtime would feed the renderer at startup. */
const siteFiles = {
	"cc-env": "production",
	"hugo.json": JSON.stringify({ title: "Batch Fixture" }),
	"layouts/partials/probe-props.html": '<p class="t">{{ .title }}</p>',
	"layouts/partials/probe-page.html": '<p class="p">{{ page.Title }}</p>',
	"layouts/partials/probe-static.html": '<p class="s">static</p>',
	"layouts/partials/probe-error.html": '<p class="e">{{ div 1 0 }}</p>',
	"content/_index.md": "---\ntitle: Home\ndate: 2024-01-01\n---\n",
	"content/blog/one.md": "---\ntitle: One\n---\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

/** Slices one keyed div's inner HTML out of the combined output. */
function keyedDiv(html: string, id: string): string {
	const open = `<div data-cc-render="${id}">`;
	const start = html.indexOf(open);
	expect(start, `no keyed div for ${id}`).toBeGreaterThanOrEqual(0);
	const end = html.indexOf("</div>", start);
	return html.slice(start + open.length, end);
}

test("one batched call renders every request keyed by id, in order", () => {
	const { html = "", error } = renderBatch(
		[
			{
				id: "cc-render-0",
				partial: "probe-props.html",
				props: { title: "First" },
			},
			{
				id: "cc-render-1",
				partial: "probe-static.html",
			},
			{
				id: "cc-render-2",
				partial: "probe-props.html",
				props: { title: "Second" },
			},
		],
		"content/blog/one.md",
	);

	expect(error).toBeUndefined();
	expect(keyedDiv(html, "cc-render-0")).toContain("First");
	expect(keyedDiv(html, "cc-render-1")).toContain('<p class="s">static</p>');
	// Same partial twice with different props dispatches per request.
	expect(keyedDiv(html, "cc-render-2")).toContain("Second");
	expect(html.indexOf("First")).toBeLessThan(html.indexOf("static"));
	expect(html.indexOf("static")).toBeLessThan(html.indexOf("Second"));
});

test("a partial that errors at render time fails only its own keyed div", () => {
	const { html = "", error } = renderBatch(
		[
			{
				id: "cc-render-0",
				partial: "probe-error.html",
			},
			{
				id: "cc-render-1",
				partial: "probe-static.html",
			},
		],
		"content/blog/one.md",
	);

	// The try-wrapped render fails the batch neither as a build error nor as
	// a renderer error; the failure is contained to the failing request.
	expect(error).toBeUndefined();
	const failed = keyedDiv(html, "cc-render-0");
	expect(failed).toContain('<cc-failed-partial data-name="probe-error.html"');
	expect(failed).toContain("execute of template failed");
	expect(keyedDiv(html, "cc-render-1")).toContain('<p class="s">static</p>');
});

test("a missing partial marks only its own keyed div", () => {
	const { html = "", error } = renderBatch(
		[
			{
				id: "cc-render-0",
				partial: "not-a-partial.html",
			},
			{
				id: "cc-render-1",
				partial: "probe-static.html",
			},
		],
		"content/blog/one.md",
	);

	expect(error).toBeUndefined();
	expect(keyedDiv(html, "cc-render-0")).toContain(
		'<cc-missing-partial data-name="not-a-partial.html">',
	);
	expect(keyedDiv(html, "cc-render-1")).toContain('<p class="s">static</p>');
});

test("a batch whose target matches no page renders page-less together", () => {
	const { html = "", error } = renderBatch(
		[
			{
				id: "cc-render-0",
				partial: "probe-page.html",
			},
			{
				id: "cc-render-1",
				partial: "probe-page.html",
			},
		],
		"content/nothing.md",
	);

	// No page backs the target, so `page` binds to Hugo's empty page — every
	// request still renders, with empty page context.
	expect(error).toBeUndefined();
	expect(keyedDiv(html, "cc-render-0")).toBe('<p class="p"></p>');
	expect(keyedDiv(html, "cc-render-1")).toBe('<p class="p"></p>');
});
