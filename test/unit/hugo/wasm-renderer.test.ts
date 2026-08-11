/**
 * Direct tests of the Hugo renderer WASM, booted in Node (no browser bundle,
 * no Hugo build involved). Runs the actual piece of Go the browser runtime
 * depends on — `writeHugoFiles` / `initHugoEditorSite` /
 * `renderHugoPartial` and friends — and asserts on its real output.
 *
 * The renderer must be built first: `npm run build:hugo`
 * (integrations/hugo/renderer/build.sh). The test fails loudly if the WASM
 * isn't there rather than skipping, so an unbootable renderer can't pass
 * quietly.
 *
 * State is sequential: the renderer holds one Hugo site for the whole file,
 * and later cases build on earlier ones (fresh renders, error recovery,
 * template updates), so ordering matters.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Side-effect only: defines `globalThis.Go` and the Node fs shim it needs.
import "../../../integrations/hugo/browser/wasm_exec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const RAW_WASM = path.join(RENDERER_DIR, "hugo_renderer.wasm");
const GZ_WASM = path.join(
	RENDERER_DIR,
	"../hugo-module/assets/cc-editable-regions/hugo_renderer.wasm.gz",
);

/** The JS surface the Go renderer exposes on globalThis once running. */
interface RendererGlobals {
	writeHugoFiles(json: string): { error?: string } | null;
	removeHugoFiles(json: string): { error?: string } | null;
	readHugoFiles(json: string): Record<string, string>;
	initHugoEditorSite(): { error?: string } | null;
	renderHugoPartial(json: string): { html?: string; error?: string } | null;
}

function renderer(): RendererGlobals {
	return globalThis as unknown as RendererGlobals;
}

/** The snapshot the browser runtime would feed the renderer at startup. */
const siteFiles = {
	"config.json": JSON.stringify({
		baseURL: "/",
		title: "Renderer unit test",
		disableKinds: ["taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"],
		params: { brand: "Fixture Brand" },
		markup: { goldmark: { renderer: { unsafe: true } } },
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
	"data/nav.yaml":
		"links:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog/\n",
};

// The renderer logs every change event and build to stdout via the wasm_exec
// fs shim; silence that so test output stays readable. Failures are reported
// through the return values, not the console.
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
	stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});

	if (!fs.existsSync(RAW_WASM) && !fs.existsSync(GZ_WASM)) {
		throw new Error(
			"No hugo_renderer.wasm found. Run `npm run build:hugo` (integrations/hugo/renderer/build.sh) first.",
		);
	}

	const wasmBytes = fs.existsSync(RAW_WASM)
		? fs.readFileSync(RAW_WASM)
		: gunzipSync(fs.readFileSync(GZ_WASM));

	const go = new (globalThis as unknown as { Go: new () => any }).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBytes,
		go.importObject,
	);
	go.run(instance);

	// The Go side registers its globals synchronously at startup.
	while (typeof renderer().renderHugoPartial !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	renderer().writeHugoFiles(JSON.stringify(siteFiles));
	const initError = renderer().initHugoEditorSite();
	if (initError?.error) {
		throw new Error(`editor site failed to boot: ${initError.error}`);
	}
}, 120_000);

afterAll(() => {
	stdoutSpy?.mockRestore();
});

function render(
	partial: string,
	props: unknown = {},
): { html?: string; error?: string } {
	return renderer().renderHugoPartial(JSON.stringify({ partial, props })) ?? {};
}

// --- Renders -------------------------------------------------------------

test("renders props into a partial", () => {
	const { html, error } = render("card.html", {
		title: "Hello World",
		body: "Some **bold** text",
		tags: ["a", "b"],
	});
	expect(error).toBeUndefined();
	expect(html).toMatch(/<h2>Hello World<\/h2>/);
	expect(html).toMatch(/<strong>bold<\/strong>/); // markdownify
	expect(html).toContain("Fixture Brand"); // site params
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

test("a missing partial reports an error", () => {
	const { html, error } = render("does-not-exist.html");
	expect(html).toBeUndefined();
	expect(error).toEqual(expect.any(String));
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
