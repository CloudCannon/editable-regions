/**
 * Direct tests of the Hugo renderer WASM, booted in Node (no browser bundle,
 * no Hugo build involved), asserting on the real Go output. Build the renderer
 * first (`npm run build:hugo`); state is sequential — later cases build on
 * earlier ones — so ordering matters.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderer,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

/** The snapshot the browser runtime would feed the renderer at startup; the
 * renderer layers its own overrides (disableKinds + the publish cascade) on
 * top of this config. */
const siteFiles = {
	"config.json": JSON.stringify({
		baseURL: "/",
		title: "Renderer unit test",
		params: { brand: "Fixture Brand" },
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
	"data/nav.yaml":
		"links:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog/\n",
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

// --- Renders -------------------------------------------------------------

test("renders props into a partial", () => {
	const { html, error } = render("card.html", {
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

test("a later render is fresh and drops stale props", () => {
	const { html, error } = render("card.html", { title: "Second Render" });
	expect(error).toBeUndefined();
	expect(html).toContain("Second Render");
	expect(html).not.toContain("Hello World");
});

test("nested partials render", () => {
	const { html, error } = render("wrapper.html", { title: "Nested" });
	expect(error).toBeUndefined();
	expect(html).toMatch(/<h2>Nested<\/h2>/);
});

test("site data files resolve", () => {
	const { html, error } = render("nav.html");
	expect(error).toBeUndefined();
	expect(html).toContain('<a href="/blog/">Blog</a>');
	expect(html).toContain('<a href="/">Home</a>');
});

test("a 20-render burst stays fresh on the incremental path", () => {
	for (let i = 0; i < 20; i++) {
		const { html, error } = render("card.html", { title: `Burst ${i}` });
		expect(error).toBeUndefined();
		expect(html).toContain(`Burst ${i}`);
	}
}, 30_000);

// --- Render target resolution ---------------------------------------------

test("with no target, renders read the home page's output", () => {
	const { html, error } = render("pageprobe.html");
	expect(error).toBeUndefined();
	// The placeholder home stub (front matter: cc_initialized) is the fallback
	// target; its publishing opt-in comes from the renderer's config cascade.
	expect(html).toContain("|true|/");
});

test("a target file path resolves to that page's built output", () => {
	// Mirrored verbatim like the browser would; the renderer looks the target
	// up by File().Path(), not by any computed page path.
	renderer().writeHugoFiles(
		JSON.stringify({
			"content/notes/one.md":
				"---\ntitle: Target One\nauthor: alice\nbuild:\n  render: always\n---\n",
		}),
	);
	const { html, error } = render("pageprobe.html", {}, "content/notes/one.md");
	expect(error).toBeUndefined();
	expect(html).toContain("Target One|x|/notes/one/");
});

test("an unmatched target falls back to the home page", () => {
	// A non-content file (e.g. a data file) matches no page — render reads home.
	const { html, error } = render("pageprobe.html", {}, "data/nav.yaml");
	expect(error).toBeUndefined();
	expect(html).toContain("|true|/");
});

// --- File surface --------------------------------------------------------

test("readHugoFiles returns written contents and skips missing paths", () => {
	const r = renderer();
	r.writeHugoFiles(JSON.stringify({ "scratch.txt": "hello" }));
	expect(r.readHugoFiles(JSON.stringify(["scratch.txt", "nope.txt"]))).toEqual({
		"scratch.txt": "hello",
	});
});

test("removeHugoFiles deletes a file", () => {
	const r = renderer();
	r.removeHugoFiles(JSON.stringify(["scratch.txt"]));
	expect(r.readHugoFiles(JSON.stringify(["scratch.txt"]))).toEqual({});
});

// --- Errors --------------------------------------------------------------

test("a missing partial renders the marker instead of a raw Hugo error", () => {
	// The dispatch layout's templates.Exists check emits a marker the runtime
	// turns into the clean component error; the build stays green so no Hugo
	// execution trace leaks through.
	const { html, error } = render("does-not-exist.html");
	expect(error).toBeUndefined();
	expect(html).toMatch(/<cc-missing-partial data-name="does-not-exist\.html"/);
});

test("renders recover after an error", () => {
	const { html, error } = render("card.html", { title: "After Error" });
	expect(error).toBeUndefined();
	expect(html).toContain("After Error");
});

// --- Live updates --------------------------------------------------------

test("template updates take effect (the editor rewrites partials)", () => {
	renderer().writeHugoFiles(
		JSON.stringify({
			"layouts/partials/card.html": "<div>UPDATED {{ .title }}</div>",
		}),
	);
	const { html, error } = render("card.html", { title: "Template" });
	expect(error).toBeUndefined();
	expect(html).toContain("UPDATED Template");
});
