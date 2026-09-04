import "./wasm_exec.js";
import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { enhanceHugoError, missingComponentError } from "./errors.ts";
import { group, groupEnd, log, setVerbose, warn } from "./logger.ts";

/** A `(props) => HTMLElement` renderer installed on `window.cc_components`. */
type HugoComponentRenderer = (
	props?: Record<string, any>,
) => Promise<HTMLElement>;

/** The file being edited, captured once at boot; `""` when the open page has
 * no associated file (the renderer then falls back to the home page). */
let currentFilePath = "";

/** @type {Promise<void> | null} */
let enginePromise: Promise<void> | null = null;

/**
 * Entry point, called by the prebuilt runtime bundle. Installs the component
 * proxy immediately and warms the WASM engine once the editor API appears —
 * so loading the script on a production page never fetches the WASM.
 */
export function initHugoLiveEditing(): void {
	const files = window.cc_hugo_files ?? {};

	setVerbose(Boolean(window.cc_hugo?.verbose));
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

/** Boots the WASM renderer once and builds the editor site from the snapshot. */
export function ensureEngine(): Promise<void> {
	if (!enginePromise) {
		enginePromise = startEngine().catch((err) => {
			// Allow a retry on transient failures (e.g. a dropped WASM fetch).
			enginePromise = null;
			throw err;
		});
	}
	return enginePromise;
}

async function startEngine(): Promise<void> {
	const wasmUrl =
		window.cc_hugo?.wasmUrl ?? "/_cloudcannon/hugo_renderer.wasm.gz";

	group("Starting Hugo renderer");
	log("Fetching WASM from", wasmUrl);

	const response = await fetch(wasmUrl);
	if (!response.ok || !response.body) {
		groupEnd();
		throw new Error(
			`Failed to fetch Hugo WASM from ${wasmUrl}: HTTP ${response.status}`,
		);
	}

	let wasmBuffer: ArrayBuffer;
	if (wasmUrl.endsWith(".gz")) {
		const decompressed = response.body.pipeThrough(
			new DecompressionStream("gzip"),
		);
		wasmBuffer = await new Response(decompressed).arrayBuffer();
	} else {
		wasmBuffer = await response.arrayBuffer();
	}

	const go = new (globalThis as any).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBuffer,
		go.importObject,
	);
	go.run(instance);

	// The Go side registers its globals synchronously at startup.
	while (
		typeof (globalThis as { renderHugoPartials?: unknown })
			.renderHugoPartials !== "function"
	) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	const files = {
		...(window.cc_hugo_files ?? {}),
		"cc-env": window.cc_hugo?.env ?? "production",
	};
	writeHugoFiles(JSON.stringify(files));

	await loadAPIData();

	const initError = initHugoEditorSite();

	if (initError?.error) {
		groupEnd();
		throw new Error(`Hugo editor site failed to build: ${initError.error}`);
	}

	log("Hugo renderer ready");
	groupEnd();
}

async function loadAPIData(): Promise<void> {
	const files: Record<string, string> = {};
	// `currentFile()` may throw when no file is associated with the open page;
	// treat that as an empty target so the renderer falls back to the home page.
	try {
		currentFilePath = CloudCannon.currentFile().path;
	} catch {
		currentFilePath = "";
	}
	const currentPath = currentFilePath;

	// Change events only mirror the files; the renderer folds pending writes
	// into its next render batch, so no explicit rebuild is needed here.
	const collections = await CloudCannon.collections();
	for (const collection of collections) {
		collection.addEventListener("change", async (event) => {
			const path = event.detail.sourcePath;
			const frontMatter = await CloudCannon.file(path).data.get();
			if (!frontMatter || typeof frontMatter !== "object") {
				return;
			}

			if (path === currentPath) {
				(frontMatter as any).build = { render: "always" };
			}

			writeHugoFiles(
				JSON.stringify({
					[path]: `---\n${JSON.stringify(frontMatter)}\n---\n`,
				}),
			);
		});
		collection.addEventListener("delete", (event) => {
			if (currentPath !== event.detail.sourcePath) {
				removeHugoFiles(JSON.stringify([event.detail.sourcePath]));
			}
		});

		const items = await collection.items();
		for (const file of items) {
			const frontMatter = await file.data.get();
			if (!frontMatter || typeof frontMatter !== "object") continue;
			if (file.path === currentPath) {
				(frontMatter as any).build = { render: "always" };
			}
			files[file.path] = `---\n${JSON.stringify(frontMatter)}\n---\n`;
		}
	}

	const datasets = await CloudCannon.datasets();
	for (const dataset of datasets) {
		dataset.addEventListener("change", async (event) => {
			const data = await CloudCannon.file(event.detail.sourcePath).data.get();
			if (data === undefined || data === null) return;
			writeHugoFiles(
				JSON.stringify({
					[datasetPath(event.detail.sourcePath)]: `${JSON.stringify(data)}\n`,
				}),
			);
		});
		dataset.addEventListener("delete", (event) => {
			removeHugoFiles(JSON.stringify([datasetPath(event.detail.sourcePath)]));
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
			`Loading editor content: ${Object.keys(files).length} files (editing ${currentPath})`,
		);
		writeHugoFiles(JSON.stringify(files));
	}
}

/**
 * Maps a dataset's source path to its mirrored data-dir path. `.yaml`/`.yml`/`.json`
 * keep their extension (Hugo natively decodes all three); anything else is
 * rewritten to `.json` so a decoder Hugo understands handles it.
 */
function datasetPath(apiPath: string): string {
	if (/\.(ya?ml|json)$/i.test(apiPath)) return apiPath;
	return `${apiPath.replace(/\.[^./]*$/, "")}.json`;
}

/**
 * Queues a partial render, resolving with the rendered element once the batch
 * window closes; all callers get batching transparently.
 */
interface QueuedRender {
	id: string;
	partial: string;
	props: Record<string, any>;
	resolve: (el: HTMLElement) => void;
	reject: (err: unknown) => void;
}

/**
 * Collects calls within this window into one renderer request: the queued
 * partials share a single incremental build (per distinct render target), so
 * a burst of N renders costs one build instead of N; small enough to be
 * imperceptible next to a build's cost.
 */
const BATCH_WINDOW_MS = 10;

let batch: QueuedRender[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let nextRenderId = 0;

/**
 * Queues a partial render, resolving with the rendered element once the batch
 * window closes; all callers get batching transparently.
 */
export async function renderHugoPartial(
	partial: string,
	props: Record<string, any> = {},
): Promise<HTMLElement> {
	await ensureEngine();

	return new Promise<HTMLElement>((resolve, reject) => {
		const id = `cc-render-${nextRenderId++}`;
		log("Queueing Hugo component:", partial, "Props:", props);
		batch.push({ id, partial, props, resolve, reject });
		if (batchTimer === null) {
			batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
		}
	});
}

/** Flushes the batch: one renderer call, then demux the keyed output. */
function flushBatch(): void {
	batchTimer = null;
	const queued = batch;
	batch = [];
	if (queued.length === 0) return;

	group(`Rendering ${queued.length} Hugo component(s)`);
	try {
		const result = renderHugoPartials(
			JSON.stringify({
				target: currentFilePath,
				requests: queued.map(({ id, partial, props }) => ({
					id,
					partial,
					props,
				})),
			}),
		);
		demuxBatch(queued, result);
	} catch (err) {
		for (const { partial, reject } of queued) {
			reject(enhanceHugoError(String(err), partial));
		}
	}
	groupEnd();
}

/**
 * Resolves each request's keyed element from the combined output; errors and
 * missing partials fail only the calls they apply to, the rest still resolves.
 */
function demuxBatch(
	queued: QueuedRender[],
	result: { html?: string; error?: string } | null,
): void {
	if (result?.error || typeof result?.html !== "string") {
		log("Render error:", result?.error);
		for (const { partial, reject } of queued) {
			reject(enhanceHugoError(result?.error ?? "no output", partial));
		}
		return;
	}

	const holder = document.createElement("div");
	holder.innerHTML = result.html;
	for (const render of queued) {
		const keyed = holder.querySelector<HTMLElement>(
			`[data-cc-render="${render.id}"]`,
		);
		if (!keyed) {
			render.reject(
				new Error(
					`Hugo render produced no output for component "${render.partial}"`,
				),
			);
			continue;
		}

		const missing = keyed.querySelector("cc-missing-partial");
		if (missing) {
			render.reject(
				missingComponentError(
					missing.getAttribute("data-name") || render.partial,
				),
			);
			continue;
		}

		const failed = keyed.querySelector("cc-failed-partial");
		if (failed) {
			render.reject(
				enhanceHugoError(
					failed.getAttribute("data-message") || "unknown error",
					failed.getAttribute("data-name") || render.partial,
				),
			);
			continue;
		}

		keyed.removeAttribute("data-cc-render");
		log("Rendered HTML preview:", keyed.innerHTML.substring(0, 200));
		render.resolve(keyed);
	}
}

/** Builds the `(props) => HTMLElement` renderer the shared core calls. */
function createComponentRenderer(key: string): HugoComponentRenderer {
	return async (props: Record<string, any> = {}) => {
		// Render only once the engine is ready; the flush then sends the
		// boot-captured currentFilePath as the batch's shared target.
		await ensureEngine();
		return renderHugoPartial(key, props);
	};
}

export function initComponentProxy(): void {
	const win = window;
	const target = win.cc_components ?? {};

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
