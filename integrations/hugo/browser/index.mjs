import "./wasm_exec.js";
import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { enhanceHugoError, missingComponentError } from "./errors.mjs";
import { group, groupEnd, log, setVerbose, warn } from "./logger.mjs";

/**
 * @typedef {Object} HugoRuntimeData
 * @property {Record<string, string>} files - Snapshot: templates and config files at their physical paths
 * @property {Record<string, any>} meta - {generator, wasmUrl, verbose}
 */

/** @type {Promise<void> | null} */
let enginePromise = null;

/**
 * Entry point, called by the prebuilt runtime bundle. Reads the emitted
 * `window.cc_hugo*` globals, installs the component proxy immediately, and
 * warms the WASM engine once the editor API appears — so loading the script on
 * a production page never fetches the WASM.
 */
export function initHugoLiveEditing() {
	const win = /** @type {any} */ (window);
	const files = win.cc_hugo_files.files ?? {};

	setVerbose(Boolean(win.cc_hugo.verbose));
	log(
		"Hugo live editing initialized.",
		Object.keys(files).length,
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
	const win = /** @type {any} */ (window);
	const wasmUrl =
		win.cc_hugo.wasmUrl ?? "/cc-editable-regions/hugo_renderer.wasm.gz";

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
	while (typeof renderHugoPartial !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	const files = {
		...win.cc_hugo_files.files,
		"cc-env": win.cc_hugo.env ?? "production",
	};
	/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));

	await loadAPIData();

	const overrides = win.cc_hugo.templateOverrides ?? {};
	const initError = initHugoEditorSite(JSON.stringify(overrides));

	if (initError?.error) {
		groupEnd();
		throw new Error(`Hugo editor site failed to build: ${initError.error}`);
	}

	log("Hugo renderer ready");
	groupEnd();
}

async function loadAPIData() {
	const files = /** @type {Record<string, string>} */ ({});

	const collections = await CloudCannon.collections();
	for (const collection of collections) {
		collection.addEventListener("change", async (event) => {
			const path = event.detail.sourcePath;
			const frontMatter = await CloudCannon.file(path).data.get();
			if (!frontMatter || typeof frontMatter !== "object") {
				return;
			}

			if (path === CloudCannon.currentFile().path) {
				frontMatter.build = { render: "always" };
			}

			writeHugoFiles(
				JSON.stringify({
					[path]: `---\n${JSON.stringify(frontMatter)}\n---\n`,
				}),
			);
			rebuildEditorSite();
		});
		collection.addEventListener("delete", (event) => {
			if (CloudCannon.currentFile().path !== event.detail.sourcePath) {
				removeHugoFiles(JSON.stringify([event.detail.sourcePath]));
				rebuildEditorSite();
			}
		});

		const items = await collection.items();
		for (const file of items) {
		  const frontMatter = await file.data.get();
			if (!frontMatter || typeof frontMatter !== "object") continue;
			if (file.path === CloudCannon.currentFile().path) {
				frontMatter.build = { render: "always" };
			}
			files[file.path] = `---\n${JSON.stringify(frontMatter)}\n---\n`;
		}
	}

	const datasets = await CloudCannon.datasets();;
	for (const dataset of datasets ?? []) {
		dataset.addEventListener("change", async (event) => {
			const data = await CloudCannon.file(event.detail.sourcePath).data.get();
			if (data === undefined || data === null) return;
			writeHugoFiles(
				JSON.stringify({
					[datasetPath(event.detail.sourcePath)]: `${JSON.stringify(data)}\n`,
				}),
			);
			rebuildEditorSite();
		});
		dataset.addEventListener("delete", (event) => {
			removeHugoFiles(JSON.stringify([datasetPath(event.detail.sourcePath)]));
			rebuildEditorSite();
		});

		const result = await dataset.items();
		for (const file of Array.isArray(result) ? result : [result]) {
			const data = await file.data.get();
			if (data === undefined || data === null) continue;
			files[datasetPath(file.path)] = `${JSON.stringify(data)}\n`;
		}
	}

	if (Object.keys(files).length > 0) {
		log(
			`Loading editor content: ${Object.keys(files).length} files (editing ${CloudCannon.currentFile().path})`,
		);
		writeHugoFiles(JSON.stringify(files));
	}
}

/**
 * Maps a dataset's source path to its mirrored data-dir path. `.yaml`/`.yml`/`.json`
 * keep their extension (Hugo natively decodes all three); anything else is
 * rewritten to `.json` so it lands in a decoder Hugo understands instead of
 * the old "serialize as YAML" fallback.
 *
 * @param {string} apiPath
 * @returns {string}
 */
function datasetPath(apiPath) {
	if (/\.(ya?ml|json)$/i.test(apiPath)) return apiPath;
	return `${apiPath.replace(/\.[^./]*$/, "")}.json`;
}

/** Runs an incremental build so Hugo re-reads changed stub files. */
function rebuildEditorSite() {
	const result = rebuildHugoEditorSite();
	if (result?.error) {
		warn(
			"Failed to rebuild the editor site after a content change:",
			result.error,
		);
	}
}

/**
 * Builds the `(props) => HTMLElement` renderer the shared core calls.
 *
 * @param {string} key - Component key from `data-component` (or an explicit
 * partial name when pinned via registerHugoComponent)
 * @returns {(props: Record<string, any>) => Promise<HTMLElement>}
 */
function createComponentRenderer(key) {
	return async (props) => {
		await ensureEngine();

		group(`Rendering Hugo component: ${key}`);
		log("Partial:", key, "Props:", props);

		const result = renderHugoPartial(
			JSON.stringify({
				key,
				props: props ?? {},
				target: CloudCannon.currentFile().path,
			}),
		);

		const missing = result?.html?.match(
			/<cc-missing-partial data-name="([^"]*)"/,
		);
		if (missing) {
			groupEnd();
			throw missingComponentError(missing[1] || key);
		}

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
