/** Boots the real WASM renderer in Node; state is sequential, so ordering matters. */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderer,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer.js";

/** The snapshot the browser runtime would feed the renderer; the renderer layers its overrides on top. */
const siteFiles = {
	"config.json": JSON.stringify({
		baseURL: "/",
		title: "Renderer unit test",
		params: { brand: "Fixture Brand", ENV_CLIENT: "site-says" },
	}),
	"layouts/partials/card.html": [
		'<div class="card">',
		"  <h2>{{ .title }}</h2>",
		"  {{ with .body }}<p>{{ . | markdownify }}</p>{{ end }}",
		"  <span>{{ site.Params.brand }}</span>",
		"  {{ range .tags }}<em>{{ . }}</em>{{ end }}",
		"</div>",
	].join("\n"),
	"layouts/partials/wrapper.html": '{{ partial "card.html" . }}',
	"layouts/partials/nav.html":
		'<nav>{{ range site.Data.nav.links }}<a href="{{ .url }}">{{ .label }}</a>{{ end }}</nav>',
	"layouts/partials/pageprobe.html":
		'<p>{{ page.Title }}|{{ page.Params.cc_initialized | default "x" }}|{{ page.RelPermalink }}</p>',
	"layouts/partials/envprobe.html": "<p>env=[{{ site.Params.ENV_CLIENT }}]</p>",
	// Hugo 0.146+'s partials dir, which templates.Exists only matches by its own path.
	"layouts/_partials/newdir.html": '<p class="newdir">from _partials</p>',
	"data/nav.yaml":
		"links:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog/\n",
	"content/notes/one.md": "---\ntitle: Target One\n---\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

test("renders props into a partial", async () => {
	const { html, error } = await render("card.html", {
		title: "Hello World",
		body: "Some **bold** text",
		tags: ["a", "b"],
	});
	expect(error).toBeUndefined();
	expect(html).toMatch(/<h2>Hello World<\/h2>/);
	expect(html).toMatch(/<strong>bold<\/strong>/);
	expect(html).toContain("Fixture Brand");
	expect(html).toContain("<em>a</em><em>b</em>");
});

test("a later render is fresh and drops stale props", async () => {
	const { html, error } = await render("card.html", { title: "Second Render" });
	expect(error).toBeUndefined();
	expect(html).toContain("Second Render");
	expect(html).not.toContain("Hello World");
});

test("nested partials render", async () => {
	const { html, error } = await render("wrapper.html", { title: "Nested" });
	expect(error).toBeUndefined();
	expect(html).toMatch(/<h2>Nested<\/h2>/);
});

test("ENV_CLIENT is true in the renderer, beating site config", async () => {
	const { html, error } = await render("envprobe.html");
	expect(error).toBeUndefined();
	expect(html).toContain("env=[true]");
});

test("site data files resolve", async () => {
	const { html, error } = await render("nav.html");
	expect(error).toBeUndefined();
	expect(html).toContain('<a href="/blog/">Blog</a>');
	expect(html).toContain('<a href="/">Home</a>');
});

test("a 20-render burst stays fresh on the incremental path", async () => {
	for (let i = 0; i < 20; i++) {
		const { html, error } = await render("card.html", { title: `Burst ${i}` });
		expect(error).toBeUndefined();
		expect(html).toContain(`Burst ${i}`);
	}
}, 30_000);

test("a target file path resolves to that page's built output", async () => {
	const { html, error } = await render(
		"pageprobe.html",
		{},
		"content/notes/one.md",
	);
	expect(error).toBeUndefined();
	expect(html).toContain("Target One|x|/notes/one/");
});

test("an edit to an existing page resolves through the incremental rebuild", async () => {
	renderer().writeHugoFiles(
		JSON.stringify({
			"content/notes/one.md": "---\ntitle: Target One Edited\n---\n",
		}),
	);
	const { html, error } = await render(
		"pageprobe.html",
		{},
		"content/notes/one.md",
	);
	expect(error).toBeUndefined();
	expect(html).toContain("Target One Edited|x|/notes/one/");
});

test("an unmatched target renders with an empty page context", async () => {
	const { html, error } = await render("pageprobe.html", {}, "data/nav.yaml");
	expect(error).toBeUndefined();
	expect(html).toContain("|x|");
});

test("readHugoFiles returns written contents and skips missing paths", async () => {
	const r = renderer();
	r.writeHugoFiles(JSON.stringify({ "scratch.txt": "hello" }));
	expect(r.readHugoFiles(JSON.stringify(["scratch.txt", "nope.txt"]))).toEqual({
		"scratch.txt": "hello",
	});
});

test("removeHugoFiles deletes a file", async () => {
	const r = renderer();
	r.removeHugoFiles(JSON.stringify(["scratch.txt"]));
	expect(r.readHugoFiles(JSON.stringify(["scratch.txt"]))).toEqual({});
});

test("renders a partial from _partials, with or without its extension", async () => {
	for (const name of ["newdir", "newdir.html"]) {
		const { html, error } = await render(name);
		expect(error).toBeUndefined();
		expect(html).toContain('<p class="newdir">from _partials</p>');
	}
});

test("a missing partial renders the marker instead of a raw Hugo error", async () => {
	const { html, error } = await render("does-not-exist.html");
	expect(error).toBeUndefined();
	expect(html).toMatch(/<cc-missing-partial data-name="does-not-exist\.html"/);
});

test("renders recover after an error", async () => {
	const { html, error } = await render("card.html", { title: "After Error" });
	expect(error).toBeUndefined();
	expect(html).toContain("After Error");
});

test("template updates take effect (the editor rewrites partials)", async () => {
	renderer().writeHugoFiles(
		JSON.stringify({
			"layouts/partials/card.html": "<div>UPDATED {{ .title }}</div>",
		}),
	);
	const { html, error } = await render("card.html", { title: "Template" });
	expect(error).toBeUndefined();
	expect(html).toContain("UPDATED Template");
});
