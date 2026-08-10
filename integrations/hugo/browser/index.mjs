// Browser half of the Hugo integration. The Hugo module's output-format
// template (`index.editable-regions.js`) emits the site's template snapshot,
// data files, config, and page map onto `window.cc_hugo*`, then loads this
// runtime. This module boots the Hugo WASM renderer from that data and
// registers `window.cc_components` renderers for the shared core.

import "./wasm_exec.js";
import { apiLoadedPromise } from "../../../helpers/cloudcannon.mjs";
import {
	group,
	groupEnd,
	log,
	setVerbose,
	warn,
} from "../../liquid/logger.mjs";
import { enhanceHugoError, missingComponentError } from "./errors.mjs";

/** Kinds the editor site never renders; disabling them trims every rebuild. */
const DISABLED_KINDS = [
	"taxonomy",
	"term",
	"RSS",
	"sitemap",
	"robotsTXT",
	"404",
];

const PARTIALS_PREFIX = "layouts/partials/";

/**
 * @typedef {Object} HugoRuntimeData
 * @property {Record<string, string>} files - Template snapshot, project-relative paths
 * @property {Record<string, string>} data - Data file snapshot, project-relative paths
 * @property {Record<string, any>} config - Normalized site config (baseURL, title, params, menus)
 * @property {Record<string, any>} pages - Page map: input path -> {url, title, kind}
 * @property {Record<string, any>} meta - {generator, wasmUrl, verbose}
 */

/** @type {HugoRuntimeData | null} */
let runtimeData = null;

/** @type {Promise<void> | null} */
let enginePromise = null;

/**
 * Entry point, called by the prebuilt runtime bundle. Reads the emitted
 * `window.cc_hugo*` globals, installs the component proxy immediately, and
 * warms the WASM engine once the CloudCannon Visual Editor API appears — so
 * loading the script on a production page never fetches the WASM.
 *
 * @param {Partial<HugoRuntimeData> & { wasmUrl?: string }} [options]
 */
export function initHugoLiveEditing(options = {}) {
	const win = /** @type {any} */ (window);
	runtimeData = {
		files: options.files ?? win.cc_hugo_files ?? {},
		data: options.data ?? win.cc_hugo_data ?? {},
		config: options.config ?? win.cc_hugo_config ?? {},
		pages: options.pages ?? win.cc_hugo_pages ?? {},
		meta: { ...(win.cc_hugo ?? {}), ...options },
	};

	setVerbose(Boolean(runtimeData.meta.verbose));
	log(
		"Hugo live editing initialized.",
		Object.keys(runtimeData.files).length,
		"templates in snapshot",
	);

	initComponentProxy();

	apiLoadedPromise.then(() => {
		ensureEngine().catch((err) => {
			warn("Failed to start the Hugo renderer:", err);
		});
	});
}

/**
 * Boots the WASM renderer once: fetch + gunzip + instantiate, then write the
 * site snapshot into its in-memory filesystem and build the editor site.
 *
 * @returns {Promise<void>}
 */
export function ensureEngine() {
	if (!enginePromise) {
		enginePromise = startEngine().catch((err) => {
			// Allow a retry on transient failures (e.g. a dropped WASM fetch).
			enginePromise = null;
			throw err;
		});
	}
	return enginePromise;
}

async function startEngine() {
	if (!runtimeData) {
		throw new Error(
			"initHugoLiveEditing() must run before the Hugo engine starts",
		);
	}

	const wasmUrl =
		runtimeData.meta.wasmUrl ?? "/cc-editable-regions/hugo_renderer.wasm.gz";

	group("Starting Hugo renderer");
	log("Fetching WASM from", wasmUrl);

	const response = await fetch(wasmUrl);
	if (!response.ok || !response.body) {
		groupEnd();
		throw new Error(
			`Failed to fetch Hugo WASM from ${wasmUrl}: HTTP ${response.status}`,
		);
	}

	let wasmBuffer;
	if (wasmUrl.endsWith(".gz")) {
		const decompressed = response.body.pipeThrough(
			new DecompressionStream("gzip"),
		);
		wasmBuffer = await new Response(decompressed).arrayBuffer();
	} else {
		wasmBuffer = await response.arrayBuffer();
	}

	const go = new /** @type {any} */ (globalThis).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBuffer,
		go.importObject,
	);
	go.run(instance);

	// The Go side registers its globals synchronously at startup.
	while (
		typeof (/** @type {any} */ (globalThis).renderHugoPartial) !== "function"
	) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	const files = {
		"config.json": JSON.stringify(buildEditorConfig(runtimeData.config)),
		...runtimeData.files,
		...runtimeData.data,
	};
	/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));

	const initError = /** @type {any} */ (globalThis).initHugoEditorSite();
	if (initError?.error) {
		groupEnd();
		throw new Error(`Hugo editor site failed to build: ${initError.error}`);
	}

	log("Hugo renderer ready");
	groupEnd();
}

/**
 * The emitted site config plus the overrides the editor site needs. Values
 * the emitter provides win over our fallbacks; the editor overrides win over
 * everything.
 *
 * @param {Record<string, any>} emitted
 */
function buildEditorConfig(emitted) {
	return {
		baseURL: "/",
		...emitted,
		disableKinds: DISABLED_KINDS,
		markup: {
			...(emitted.markup ?? {}),
			goldmark: {
				...(emitted.markup?.goldmark ?? {}),
				renderer: {
					...(emitted.markup?.goldmark?.renderer ?? {}),
					unsafe: true,
				},
			},
		},
	};
}

/**
 * Resolves a component key to a partial name (the path Hugo's `partial`
 * function expects, relative to layouts/partials). Keys map 1:1 onto partial
 * paths, extension optional: "card" and "card.html" both resolve
 * layouts/partials/card.html; "cards/hero" resolves nested paths.
 *
 * @param {string} key
 * @returns {string | null}
 */
export function resolvePartialName(key) {
	const files = runtimeData?.files ?? {};
	const candidates = [key, `${key}.html`, `${key}.htm`];
	for (const candidate of candidates) {
		if (`${PARTIALS_PREFIX}${candidate}` in files) {
			return candidate;
		}
	}
	return null;
}

/** @returns {string[]} Partial names available in the snapshot. */
function availablePartials() {
	return Object.keys(runtimeData?.files ?? {})
		.filter((path) => path.startsWith(PARTIALS_PREFIX))
		.map((path) => path.slice(PARTIALS_PREFIX.length));
}

/**
 * Builds the `(props) => HTMLElement` renderer the shared core calls.
 *
 * @param {string} key - Component key from `data-component`
 * @returns {(props: Record<string, any>) => Promise<HTMLElement>}
 */
function createComponentRenderer(key) {
	return async (props) => {
		await ensureEngine();

		const partial = resolvePartialName(key);
		if (!partial) {
			throw missingComponentError(key, availablePartials());
		}

		group(`Rendering Hugo component: ${key}`);
		log("Partial:", partial, "Props:", props);

		const result = /** @type {any} */ (globalThis).renderHugoPartial(
			JSON.stringify({ partial, props: props ?? {} }),
		);

		if (result?.error || typeof result?.html !== "string") {
			log("Render error:", result?.error);
			groupEnd();
			throw enhanceHugoError(result?.error ?? "no output", key);
		}

		log("Rendered HTML preview:", result.html.substring(0, 200));
		const rootEl = document.createElement("div");
		rootEl.innerHTML = result.html;
		groupEnd();
		return rootEl;
	};
}

/**
 * Pins a component renderer under `key`, optionally to an explicit partial.
 * Takes precedence over the on-demand proxy resolution.
 *
 * @param {string} key
 * @param {string} [partialName] - Defaults to resolving `key` itself
 */
export function registerHugoComponent(key, partialName) {
	const win = /** @type {any} */ (window);
	win.cc_components = win.cc_components || {};
	win.cc_components[key] = createComponentRenderer(partialName ?? key);
	log("Registered Hugo component:", key);
}

/**
 * Wraps `window.cc_components` in a Proxy that resolves any component name
 * on demand against the partial snapshot. Explicitly registered names take
 * precedence.
 */
export function initComponentProxy() {
	const win = /** @type {any} */ (window);
	const target = win.cc_components || {};

	win.cc_components = new Proxy(target, {
		get(registered, key, receiver) {
			if (Reflect.has(registered, key)) {
				return Reflect.get(registered, key, receiver);
			}
			if (typeof key === "string") {
				return createComponentRenderer(key);
			}
			return undefined;
		},
	});
}
