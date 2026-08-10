/**
 * Verifies the Hugo integration's emit contract and render loop, in Node.
 *
 * Two halves:
 *  1. STRUCTURAL — the module's output-format template emitted
 *     register-components.js with the template snapshot, data files, site
 *     config, page map, and runtime loader; the module's static assets were
 *     copied into the output.
 *  2. ROUND-TRIP — boot the real renderer WASM from the emitted data (exactly
 *     what the browser runtime does), render the fixture's card component
 *     with the same props as the front matter, and check it against the
 *     build-time HTML inside the editable region.
 *
 * Run after `hugo`: node verify-bundle.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const bundlePath = path.join(publicDir, "register-components.js");

let failures = 0;
function check(name, cond, detail = "") {
	if (cond) {
		console.log(`  ok: ${name}`);
	} else {
		failures += 1;
		console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

// --- 1. Structural checks on the emitted bundle ----------------------------

if (!fs.existsSync(bundlePath)) {
	console.error(`Bundle not found at ${bundlePath}. Run \`hugo\` first.`);
	process.exit(1);
}
const bundle = fs.readFileSync(bundlePath, "utf8");

// Evaluate the emitted JS with window/document stubs to get the data out.
const injectedScripts = [];
const sandbox = {
	window: {},
	document: {
		createElement: () => ({}),
		head: {
			appendChild: (el) => injectedScripts.push(el.src),
		},
	},
};
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox);
const win = sandbox.window;

check(
	"template snapshot contains the card partial",
	win.cc_hugo_files?.["layouts/partials/card.html"]?.includes("{{ .title }}"),
);
check(
	"template snapshot contains nested project partials only",
	win.cc_hugo_files?.["layouts/partials/nav.html"] !== undefined,
);
check(
	"data snapshot contains the links data file",
	win.cc_hugo_data?.["data/links.yaml"]?.includes("label: Docs"),
);
check(
	"site config carries params",
	win.cc_hugo_config?.params?.brand === "Fixture Brand",
);
check(
	"site config carries menus",
	win.cc_hugo_config?.menus?.main?.some((item) => item.name === "Blog"),
);
check("page map resolves the home page", win.cc_hugo_pages?.["_index.md"]?.url === "/");
check(
	"meta carries the wasm url",
	win.cc_hugo?.wasmUrl?.endsWith("hugo_renderer.wasm.gz"),
);
check(
	"runtime loader injected",
	injectedScripts.some((src) => src?.endsWith("cc-editable-regions/runtime.js")),
);

check(
	"module static assets copied: runtime.js",
	fs.existsSync(path.join(publicDir, "cc-editable-regions/runtime.js")),
);
const wasmPath = path.join(publicDir, "cc-editable-regions/hugo_renderer.wasm.gz");
check("module static assets copied: hugo_renderer.wasm.gz", fs.existsSync(wasmPath));

// The annotated wrapper in the build-time HTML.
const homeHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
check(
	"build html carries the editable region annotation",
	homeHtml.includes('data-editable="component"') &&
		homeHtml.includes('data-component="card.html"') &&
		homeHtml.includes('data-prop="card"'),
);

// --- 2. Round-trip: boot the WASM from the emitted data and render ---------

if (failures === 0) {
	await import(
		path.join(here, "../../../integrations/hugo/browser/wasm_exec.js")
	);
	const go = new globalThis.Go();
	const wasmBytes = gunzipSync(fs.readFileSync(wasmPath));
	const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
	go.run(instance);
	while (typeof globalThis.renderHugoPartial !== "function") {
		await new Promise((r) => setTimeout(r, 10));
	}

	// Mirrors buildEditorConfig in the browser runtime.
	const editorConfig = {
		baseURL: "/",
		...win.cc_hugo_config,
		disableKinds: ["taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"],
		markup: { goldmark: { renderer: { unsafe: true } } },
	};

	globalThis.writeHugoFiles(
		JSON.stringify({
			"config.json": JSON.stringify(editorConfig),
			...win.cc_hugo_files,
			...win.cc_hugo_data,
		}),
	);
	const initError = globalThis.initHugoEditorSite();
	check("editor site boots from emitted data", !initError, initError?.error);

	// The same props the front matter provides (what the CC API would serve).
	const frontMatter = JSON.parse(
		fs.readFileSync(path.join(here, "content/_index.md"), "utf8"),
	);
	const rendered = globalThis.renderHugoPartial(
		JSON.stringify({ partial: "card.html", props: frontMatter.card }),
	);
	check(
		"editor render succeeds",
		typeof rendered?.html === "string",
		rendered?.error,
	);

	// The editor render must match the build-time render of the same partial.
	const regionMatch = homeHtml.match(
		/<div data-editable="component"[^>]*>([\s\S]*?)<\/div>\s*<nav>/,
	);
	const buildTimeCard = regionMatch?.[1]?.trim();
	const editorCard = rendered?.html?.trim();
	check(
		"editor render matches the build-time render",
		Boolean(buildTimeCard) && editorCard === buildTimeCard,
		`build:\n${buildTimeCard}\n---\neditor:\n${editorCard}`,
	);

	// Menus and data files resolve inside the editor renderer too.
	const nav = globalThis.renderHugoPartial(
		JSON.stringify({ partial: "nav.html", props: {} }),
	);
	check("menus resolve in editor renders", nav?.html?.includes('<a href="/blog/">Blog</a>'));
	check(
		"data files resolve in editor renders",
		nav?.html?.includes('<a href="/docs/">Docs</a>'),
	);
}

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log("\nAll Hugo integration checks passed");
process.exit(0);
