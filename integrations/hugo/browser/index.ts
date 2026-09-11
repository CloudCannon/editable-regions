import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { HugoRenderer } from "./hugo-renderer.ts";
import { log, setVerbose, warn } from "./logger.ts";

/** A `(props) => HTMLElement` renderer installed on `window.cc_components`. */
type HugoComponentRenderer = (
	props?: Record<string, any>,
) => Promise<HTMLElement>;

/** The file being edited, captured once at boot; `""` when the open page has
 * no associated file (the renderer then falls back to the home page). */
let currentFilePath = "";

let renderer: HugoRenderer | null = null;

function getRenderer(): HugoRenderer {
	renderer ??= new HugoRenderer({
		wasmUrl: window.cc_hugo?.wasmUrl ?? "/_cloudcannon/hugo_renderer.wasm.gz",
		env: window.cc_hugo?.env ?? "production",
		workerUrl: window.cc_hugo?.workerUrl,
		getTarget: () => currentFilePath,
		getFiles: () => ({ ...(window.cc_hugo_files ?? {}) }),
		onBooted: () => loadAPIData(getRenderer()),
	});
	return renderer;
}

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
		getRenderer()
			.ready()
			.catch((err) => {
				warn("Failed to start the Hugo renderer:", err);
			});
	});
}

async function loadAPIData(engine: HugoRenderer): Promise<void> {
	const files: Record<string, string> = {};
	try {
		currentFilePath = CloudCannon.currentFile().path;
	} catch {
		currentFilePath = "";
	}
	const currentPath = currentFilePath;

	const collections = await CloudCannon.collections();
	for (const collection of collections) {
		collection.addEventListener("change", async (event) => {
			const path = event.detail.sourcePath;
			const frontMatter = await CloudCannon.file(path).data.get();
			if (!frontMatter || typeof frontMatter !== "object") {
				return;
			}

			engine.writeFiles(
				JSON.stringify({
					[path]: `---\n${JSON.stringify(frontMatter)}\n---\n`,
				}),
			);
		});
		collection.addEventListener("delete", (event) => {
			if (currentPath !== event.detail.sourcePath) {
				engine.removeFiles(JSON.stringify([event.detail.sourcePath]));
			}
		});

		const items = await collection.items();
		for (const file of items) {
			const frontMatter = await file.data.get();
			if (!frontMatter || typeof frontMatter !== "object") continue;
			files[file.path] = `---\n${JSON.stringify(frontMatter)}\n---\n`;
		}
	}

	const datasets = await CloudCannon.datasets();
	for (const dataset of datasets) {
		dataset.addEventListener("change", async (event) => {
			const data = await CloudCannon.file(event.detail.sourcePath).data.get();
			if (data === undefined || data === null) return;
			engine.writeFiles(
				JSON.stringify({
					[datasetPath(event.detail.sourcePath)]: `${JSON.stringify(data)}\n`,
				}),
			);
		});
		dataset.addEventListener("delete", (event) => {
			engine.removeFiles(
				JSON.stringify([datasetPath(event.detail.sourcePath)]),
			);
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
		await engine.writeFiles(JSON.stringify(files));
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

/** Builds the `(props) => HTMLElement` renderer the shared core calls. */
function createComponentRenderer(key: string): HugoComponentRenderer {
	return async (props: Record<string, any> = {}) => {
		// Render only once the engine is ready; the flush then sends the
		// boot-captured currentFilePath as the batch's shared target.
		const engine = getRenderer();
		await engine.ready();
		return engine.renderPartial(key, props);
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
