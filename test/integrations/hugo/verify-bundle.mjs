/**
 * Verifies the Hugo integration's emit contract and render loop, in Node.
 *
 * Two halves:
 *  1. STRUCTURAL — the module published the single fingerprinted bundle
 *     (snapshot prelude + runtime, concatenated by cc/resources.html) and
 *     the fingerprinted renderer WASM, and the home page's <head> carries
 *     the bundle's script tag.
 *  2. ROUND-TRIP — boot the real renderer WASM from the emitted snapshot
 *     (exactly what the browser runtime does), render the fixture's card
 *     component with the same props as the front matter, and check it
 *     against the build-time HTML inside the editable region.
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

const assetDir = path.join(publicDir, "cc-editable-regions");
const assets = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
const bundleName = assets.find((f) => /^live-editing\..+\.js$/.test(f));
const wasmName = assets.find((f) => /^hugo_renderer\.wasm\..+\.gz$/.test(f));

check(
	"fingerprinted bundle published",
	Boolean(bundleName),
	assets.join(", ") || "(asset dir missing or empty)",
);
check(
	"fingerprinted renderer WASM published",
	Boolean(wasmName),
	assets.join(", ") || "(asset dir missing or empty)",
);
check(
	"no stray assets published (runtime and snapshot are bundle inputs only)",
	assets.length > 0 &&
		assets.every((f) => f === bundleName || f === wasmName),
	assets.join(", "),
);
check(
	"legacy register-components.js not emitted",
	!fs.existsSync(path.join(publicDir, "register-components.js")),
);

const bundle = bundleName
	? fs.readFileSync(path.join(assetDir, bundleName), "utf8")
	: "";

// The snapshot prelude sits ahead of the runtime, split by its sentinel.
const [snapshot, runtime] = bundle.split("/* cc:snapshot:end */");
check(
	"bundle contains the snapshot prelude and runtime, in order",
	Boolean(snapshot) && typeof runtime === "string" && runtime.length > 0,
);
check(
	"runtime follows the snapshot prelude",
	Boolean(runtime?.includes("renderHugoPartial")),
);

// Evaluate the snapshot prelude to get the emitted data out.
const sandbox = { window: {} };
vm.createContext(sandbox);
if (snapshot) {
	vm.runInContext(snapshot, sandbox);
}
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
	"meta carries the fingerprinted wasm url",
	/\/cc-editable-regions\/hugo_renderer\.wasm\..+\.gz$/.test(
		win.cc_hugo?.wasmUrl ?? "",
	),
);

// The head partial references the bundle with SRI and defer.
const homeHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
check(
	"head includes the bundle script tag",
	Boolean(bundleName) &&
		homeHtml.includes(`src="/cc-editable-regions/${bundleName}"`) &&
		homeHtml.includes('integrity="sha256-') &&
		homeHtml.includes("defer"),
);

// The annotated wrapper in the build-time HTML.
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
	const wasmPath = path.join(assetDir, wasmName);
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
