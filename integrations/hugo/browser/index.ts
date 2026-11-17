import "../../../helpers/globals.js";
import { apiLoadedPromise, CloudCannon } from "../../../helpers/cloudcannon.js";
import { HugoRenderer } from "./hugo-renderer.js";
import { log, setVerbose, warn } from "./logger.js";

declare global {
	interface HugoRuntimeMeta {
		generator?: string;
		wasmUrl?: string;
		workerUrl?: string;
		verbose?: boolean;
		env?: string;
	}

	interface HugoEditorResult {
		error?: string;
	}

	interface HugoRenderResult {
		html?: string;
		error?: string;
	}

	interface Window {
		cc_hugo?: HugoRuntimeMeta;
		cc_hugo_files?: Record<string, string>;
	}

	/** Set by the WASM renderer once it boots; undefined before that. */
	function writeHugoFiles(json: string): HugoEditorResult | null;
	function removeHugoFiles(json: string): HugoEditorResult | null;
	function readHugoFiles(json: string): Record<string, string>;
	function initHugoEditorSite(): HugoEditorResult | null;
	function renderHugoPartials(
		json: string,
		callback: (result: HugoRenderResult) => void,
	): void;
}

type HugoComponentRenderer = (
	props?: Record<string, any>,
) => Promise<HTMLElement>;

/** The open page's file path; `""` falls back to the home page. */
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

/** Warms WASM only after the editor API appears, so production pages never fetch it. */
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

/** Keeps yaml/yml/json extensions (Hugo decodes them natively); mirrors the rest as `.json`. */
function datasetPath(apiPath: string): string {
	if (/\.(ya?ml|json)$/i.test(apiPath)) return apiPath;
	return `${apiPath.replace(/\.[^./]*$/, "")}.json`;
}

function createComponentRenderer(key: string): HugoComponentRenderer {
	return async (props: Record<string, any> = {}) => {
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
