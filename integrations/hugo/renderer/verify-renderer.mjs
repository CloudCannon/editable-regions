/**
 * Smoke test for the Hugo renderer WASM, run in Node (no browser needed).
 * Exercises the full surface the browser runtime depends on: file writes,
 * site init, repeated partial renders, props handling, and error reporting.
 *
 * Run after `./build.sh` (or a plain `go build`):
 *   node verify-renderer.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));

await import(path.join(here, "../browser/wasm_exec.js"));

const rawPath = path.join(here, "hugo_renderer.wasm");
const gzPath = path.join(
	here,
	"../hugo-module/static/cc-editable-regions/hugo_renderer.wasm.gz",
);

let wasmBytes;
if (fs.existsSync(rawPath)) {
	wasmBytes = fs.readFileSync(rawPath);
} else if (fs.existsSync(gzPath)) {
	wasmBytes = gunzipSync(fs.readFileSync(gzPath));
} else {
	console.error("No hugo_renderer.wasm found. Run ./build.sh first.");
	process.exit(1);
}

const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
go.run(instance);

// The Go side registers its globals synchronously at startup.
while (typeof globalThis.renderHugoPartial !== "function") {
	await new Promise((r) => setTimeout(r, 10));
}

let failures = 0;
function check(name, cond, detail = "") {
	if (cond) {
		console.log(`  ok: ${name}`);
	} else {
		failures += 1;
		console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

// --- Site setup -----------------------------------------------------------

globalThis.writeHugoFiles(
	JSON.stringify({
		"config.json": JSON.stringify({
			baseURL: "/",
			title: "Renderer smoke test",
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
			"<nav>{{ range site.Data.nav.links }}<a href=\"{{ .url }}\">{{ .label }}</a>{{ end }}</nav>",
		"data/nav.yaml": "links:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog/\n",
	}),
);

const initError = globalThis.initHugoEditorSite();
check("site initializes", !initError, initError?.error);

// --- Renders --------------------------------------------------------------

const first = globalThis.renderHugoPartial(
	JSON.stringify({
		partial: "card.html",
		props: {
			title: "Hello World",
			body: "Some **bold** text",
			tags: ["a", "b"],
		},
	}),
);
check("render returns html", typeof first?.html === "string", first?.error);
check("props render", first?.html?.includes("<h2>Hello World</h2>"));
check("markdownify works", first?.html?.includes("<strong>bold</strong>"));
check("site params resolve", first?.html?.includes("Fixture Brand"));
check("arrays render", first?.html?.includes("<em>a</em><em>b</em>"));

const second = globalThis.renderHugoPartial(
	JSON.stringify({
		partial: "card.html",
		props: { title: "Second Render" },
	}),
);
check("second render is fresh", second?.html?.includes("Second Render"));
check(
	"second render drops stale props",
	!second?.html?.includes("Hello World"),
);

const nested = globalThis.renderHugoPartial(
	JSON.stringify({
		partial: "wrapper.html",
		props: { title: "Nested" },
	}),
);
check("nested partials render", nested?.html?.includes("<h2>Nested</h2>"));

const data = globalThis.renderHugoPartial(
	JSON.stringify({ partial: "nav.html", props: {} }),
);
check("site data resolves", data?.html?.includes('<a href="/blog/">Blog</a>'));

// A burst of renders — the incremental path must stay fresh and not error.
let burstOk = true;
const start = Date.now();
for (let i = 0; i < 20; i++) {
	const r = globalThis.renderHugoPartial(
		JSON.stringify({ partial: "card.html", props: { title: `Burst ${i}` } }),
	);
	if (!r?.html?.includes(`Burst ${i}`)) burstOk = false;
}
check("20-render burst stays fresh", burstOk);
console.log(`  (burst took ${Date.now() - start}ms)`);

// --- Errors ---------------------------------------------------------------

const missing = globalThis.renderHugoPartial(
	JSON.stringify({ partial: "does-not-exist.html", props: {} }),
);
check("missing partial reports an error", typeof missing?.error === "string");

const recovered = globalThis.renderHugoPartial(
	JSON.stringify({ partial: "card.html", props: { title: "After Error" } }),
);
check("renders recover after an error", recovered?.html?.includes("After Error"));

// Live template updates (the editor rewrites a partial when its source changes).
globalThis.writeHugoFiles(
	JSON.stringify({
		"layouts/partials/card.html": "<div>UPDATED {{ .title }}</div>",
	}),
);
const updated = globalThis.renderHugoPartial(
	JSON.stringify({ partial: "card.html", props: { title: "Template" } }),
);
check("template updates take effect", updated?.html?.includes("UPDATED Template"));

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log("\nAll renderer checks passed");
process.exit(0);
