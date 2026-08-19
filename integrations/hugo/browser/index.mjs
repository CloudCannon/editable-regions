// Browser half of the Hugo integration. The Hugo module's snapshot prelude
// emits the site's template snapshot, data files, and config onto
// `window.cc_hugo*`, concatenated ahead of this runtime in the published
// bundle. This module boots the Hugo WASM renderer from that data and
// registers `window.cc_components` renderers for the shared core.

import "./wasm_exec.js";
import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { enhanceHugoError, missingComponentError } from "./errors.mjs";
import { group, groupEnd, log, setVerbose, warn } from "./logger.mjs";
import { serializeData, serializeFrontMatter } from "./serialize-yaml.mjs";

/** Kinds the editor site never renders; disabling them trims every rebuild. */
const DISABLED_KINDS = [
	"taxonomy",
	"term",
	"RSS",
	"sitemap",
	"robotsTXT",
	"404",
];

/**
 * Memfs key for a mirrored file: the API's site-root-relative source path
 * with the leading slash removed ("/content/blog/one.md" ->
 * "content/blog/one.md"). Verbatim mirroring — the same string the renderer
 * matches against each built page's file path to resolve the render target,
 * so no page-path computation happens on either side.
 * @param {string} apiPath
 * @returns {string}
 */
function rootRelativePath(apiPath) {
	return String(apiPath ?? "")
		.replace(/^\/+/, "")
		.replace(/\\/g, "/");
}

/**
 * The file being edited, captured once at boot from the CloudCannon API as a
 * verbatim site-root-relative path ("" when no file is current). Navigating
 * to another page reboots the editor (a fresh page load), so the target
 * never changes mid session: the renderer resolves the built page whose file
 * path matches, and this file's stub carries the build.render opt-in that
 * publishes it meanwhile. The home page's publishing is the renderer's own
 * (config cascade); the browser never knows the home path.
 * @type {string}
 */
let sessionFile = "";

/**
 * The collections and datasets mirrored at boot. Each is subscribed to
 * change/delete events after the editor site exists (so boot-time writes
 * can't race the first build); the handlers rewrite the affected stub/data
 * file and rebuild.
 * @type {any[]}
 */
let editorCollections = [];

/** @type {any[]} */
let editorDatasets = [];

/**
 * @typedef {Object} HugoRuntimeData
 * @property {Record<string, string>} files - Template snapshot, canonical layouts/ paths
 * @property {Record<string, any>} config - Normalized site config (baseURL, title, params, menus)
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
		config: options.config ?? win.cc_hugo_config ?? {},
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

	// The snapshot always sets meta.wasmUrl — a fingerprinted same-origin
	// asset (published under _cloudcannon/ from the version-pinned release,
	// or the local build). This fallback only applies when booting outside
	// the module's bundle.
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
		// The editor's own config, named so it can never collide with a
		// mirrored site config file (site root configs mirror as hugo.json /
		// config.json; see mirrorSiteConfig). The renderer pins loadConfig to
		// this filename, so the mirrored site config files are inert during
		// the editor build — they exist only for the pre-init dirs probe.
		"cc-editor.json": JSON.stringify(buildEditorConfig(runtimeData.config)),
		...runtimeData.files,
	};
	/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));

	// Content stubs (front matter only, blank bodies) and dataset data files
	// land on the filesystem before the site is created, so the editor site
	// is built with the full page tree present from the start — no
	// incremental content-add path.
	await loadEditorCollectionData();

	const initError = /** @type {any} */ (globalThis).initHugoEditorSite();
	if (initError?.error) {
		groupEnd();
		throw new Error(`Hugo editor site failed to build: ${initError.error}`);
	}

	// Edits made after boot are pushed into the editor site by each mirrored
	// collection's and dataset's change/delete events (installed now the site
	// exists, so boot-time writes can't race the first build).
	watchContentChanges();

	log("Hugo renderer ready");
	groupEnd();
}

/**
 * Mirrors the site's CloudCannon collections and datasets into the editor
 * site before it's built. Collections become content stubs (front matter
 * only, blank bodies — decision 10) and datasets become data files, each
 * keyed verbatim at its site-root-relative path under the editor's default
 * content/ and data/ dirs — so standard trees land exactly where Hugo reads
 * them; relocated trees resolve because the mirrored site config (see
 * mirrorSiteConfig) makes the editor's contentDir/dataDir match the real
 * site's. Everything a CloudCannon collection yields is mirrored as content,
 * verbatim — no content-dir filtering. The session target's stub carries
 * build.render: "always" so it publishes under the cascade; the home page's
 * publishing is the renderer's config cascade.
 */
async function loadEditorCollectionData() {
	if (!CloudCannon) return;
	// The file being edited is fixed for the session (navigation reboots the
	// editor and re-runs this), so capture its verbatim path once at boot:
	// the loader opts that file's stub into publishing and sends it as the
	// render target. With no current file there is no session target — the
	// renderer falls back to the home page.
	sessionFile = rootRelativePath(CloudCannon.currentFile?.()?.path);

	const files = /** @type {Record<string, string>} */ ({});
	editorCollections = [];
	editorDatasets = [];

	// The site's real config files must be in place before the editor site is
	// created: the renderer probes them (mirrored as JSON at their real paths)
	// to learn the site's contentDir/dataDir, then splices them into the
	// editor config before any stub depends on the dirs. Collections and
	// datasets mirror under those dirs, so config lands first.
	// await mirrorSiteConfig(files);

	if (typeof CloudCannon.collections === "function") {
		let collections;
		try {
			collections = await CloudCannon.collections();
		} catch (error) {
			warn("Failed to list collections, content will be unavailable:", error);
		}
		for (const collection of collections ?? []) {
			let items;
			try {
				items = await collection?.items?.();
			} catch (error) {
				warn(`Failed to list ${collection?.collectionKey}:`, error);
				continue;
			}
			for (const file of items ?? []) {
				const apiPath = file?.path;
				if (!apiPath) continue;
				let frontMatter;
				try {
					frontMatter = await file?.data?.get?.();
				} catch (error) {
					warn(`Failed to read front matter for ${apiPath}:`, error);
					continue;
				}
				if (!frontMatter || typeof frontMatter !== "object") continue;
				files[rootRelativePath(apiPath)] = stubContents(
					frontMatter,
					rootRelativePath(apiPath),
				);
			}
			editorCollections.push(collection);
		}
	}

	if (typeof CloudCannon.datasets === "function") {
		let datasets;
		try {
			datasets = await CloudCannon.datasets();
		} catch (error) {
			warn("Failed to list datasets, site data will be unavailable:", error);
		}
		for (const dataset of datasets ?? []) {
			let result;
			try {
				result = await dataset?.items?.();
			} catch (error) {
				warn(`Failed to list ${dataset?.datasetKey}:`, error);
				continue;
			}
			// A Dataset's items() resolves to a single File or an array.
			for (const file of Array.isArray(result) ? result : [result]) {
				if (!file?.path) continue;
				let data;
				try {
					data = await file?.data?.get?.();
				} catch (error) {
					warn(`Failed to read dataset file ${file.path}:`, error);
					continue;
				}
				if (data === undefined || data === null) continue;
				files[rootRelativePath(file.path)] = serializeDataset(data, file.path);
			}
			editorDatasets.push(dataset);
		}
	}

	if (Object.keys(files).length > 0) {
		log(
			`Loading editor content: ${Object.keys(files).length} files` +
				(sessionFile ? ` (editing ${sessionFile})` : ""),
		);
		/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));
	}
}

/**
 * Config-dir roots the editor's config probe (learnSiteConfigDirs in the
 * renderer) reads. Root candidates are exactly the names Hugo's default-name
 * search accepts; config-dir candidates cover every supported format file
 * under config/_default or the build-time environment layer, since Hugo
 * merges all of them (menu.toml, params.toml and friends belong to a real
 * config). Only that one environment layer is mirrored — the renderer loads
 * the config with meta.env as the active environment, so mirroring any other
 * layer would change what Hugo resolves.
 */
const CONFIG_EXT_RE = /\.(?:toml|yaml|yml|json)$/i;

/**
 * @param {string} rel - Site-root-relative source path (no leading slash)
 * @param {string} env - Build-time environment from the snapshot
 * @returns {boolean}
 */
function isConfigCandidate(rel, env) {
	if (!CONFIG_EXT_RE.test(rel)) return false;
	if (!rel.includes("/")) {
		const base = rel.slice(0, rel.lastIndexOf(".")).toLowerCase();
		return base === "hugo" || base === "config";
	}
	return rel.startsWith("config/_default/") || rel.startsWith(`config/${env}/`);
}

/**
 * Mirrors the site's config files into the editor site at their real paths,
 * so the renderer can learn the site's directories through Hugo's own config
 * resolution instead of re-implementing precedence. The CloudCannon API
 * already parses config files to objects (data.get()), so each candidate is
 * re-serialized as JSON with the extension changed to .json (a mirrored
 * hugo.toml becomes hugo.json) — the renderer's probe then only ever decodes
 * JSON. theme/themesDir/module are dropped from every candidate: the editor
 * never resolves themes or modules, and a native load that sees them would
 * try (and fail) to fetch them in the WASM renderer. Also writes the
 * cc-env carrier the renderer reads to pick the active environment.
 *
 * @param {Record<string, string>} files - Memfs write map being built for boot
 */
async function mirrorSiteConfig(files) {
	if (!CloudCannon || typeof CloudCannon.files !== "function") return;
	// Only reachable after initHugoLiveEditing, which sets runtimeData.
	const env =
		/** @type {HugoRuntimeData} */ (runtimeData).meta.env ?? "production";

	let siteFiles;
	try {
		siteFiles = await CloudCannon.files();
	} catch (error) {
		warn("Failed to list files for config mirroring:", error);
		return;
	}

	for (const file of siteFiles ?? []) {
		const rel = rootRelativePath(file?.path);
		if (!rel || !isConfigCandidate(rel, env)) continue;
		let data;
		try {
			data = await file?.data?.get?.();
		} catch (error) {
			warn(`Failed to read site config ${rel}:`, error);
			continue;
		}
		if (!data || typeof data !== "object" || Array.isArray(data)) continue;
		// The editor never runs the site's themes or modules; without this the
		// renderer's native config probe would fail resolving them.
		const configData = /** @type {Record<string, any>} */ (data);
		delete configData.theme;
		delete configData.themesDir;
		delete configData.module;
		files[rel.replace(/\.(?:toml|yaml|yml)$/i, ".json")] = JSON.stringify(data);
	}

	files["cc-env"] = env;
}

/**
 * Subscribes to each mirrored collection's and dataset's change/delete
 * events and pushes edits into the editor site as they happen — the
 * mid-session freshness the boot-time mirror alone can't provide. A
 * collection `change` fires when any of its files is created or updated and
 * carries `event.detail.sourcePath` (new files ride the same event). Each
 * handler performs exactly one write followed by a
 * `rebuildHugoEditorSite`, so the dispatch page stays alone in its own
 * (render) build — no change set ever batches two writes (the
 * multi-content-change quirk).
 */
function watchContentChanges() {
	for (const collection of editorCollections) {
		/** @param {any} event */
		const onChange = (event) => {
			handleCollectionEvent(event, "change");
		};
		/** @param {any} event */
		const onDelete = (event) => {
			handleCollectionEvent(event, "delete");
		};
		collection.addEventListener?.("change", onChange);
		collection.addEventListener?.("delete", onDelete);
	}

	for (const dataset of editorDatasets) {
		/** @param {any} event */
		const onChange = (event) => {
			handleDatasetEvent(event, "change");
		};
		/** @param {any} event */
		const onDelete = (event) => {
			handleDatasetEvent(event, "delete");
		};
		dataset.addEventListener?.("change", onChange);
		dataset.addEventListener?.("delete", onDelete);
	}

	log(
		`Watching ${editorCollections.length} collections and ${editorDatasets.length} datasets`,
	);
}

/** @param {any} event @param {"change" | "delete"} kind */
function handleCollectionEvent(event, kind) {
	const apiPath = event?.detail?.sourcePath;
	if (!apiPath) return;
	if (kind === "delete") {
		removeContentStub(apiPath).catch((err) =>
			warn(`Failed to remove content stub for ${apiPath}:`, err),
		);
	} else {
		updateContentStub(apiPath).catch((err) =>
			warn(`Failed to refresh content stub for ${apiPath}:`, err),
		);
	}
}

/** @param {any} event @param {"change" | "delete"} kind */
function handleDatasetEvent(event, kind) {
	const apiPath = event?.detail?.sourcePath;
	if (!apiPath) return;
	if (kind === "delete") {
		removeDatasetFile(apiPath).catch((err) =>
			warn(`Failed to remove dataset file ${apiPath}:`, err),
		);
	} else {
		updateDatasetFile(apiPath).catch((err) =>
			warn(`Failed to refresh dataset file ${apiPath}:`, err),
		);
	}
}

/**
 * Re-fetches a changed content file's front matter from the API and rewrites
 * its stub in the editor site, then rebuilds so Hugo re-reads it into the
 * store — `page.*`, `site.Pages`, `site.GetPage`, and collection queries all
 * refresh for the next component render.
 *
 * @param {string} apiPath - Root-relative source path from the event
 */
async function updateContentStub(apiPath) {
	let frontMatter;
	try {
		frontMatter = await CloudCannon?.file?.(apiPath)?.data?.get?.();
	} catch (error) {
		warn(`Failed to read front matter for ${apiPath}:`, error);
		return;
	}
	// A file deleted between the event and the fetch resolves to nothing.
	if (!frontMatter || typeof frontMatter !== "object") return;

	const filePath = rootRelativePath(apiPath);
	if (!filePath) return;
	/** @type {any} */ (globalThis).writeHugoFiles(
		JSON.stringify({ [filePath]: stubContents(frontMatter, filePath) }),
	);
	rebuildEditorSite();
}

/**
 * Re-fetches a changed dataset file from the API and rewrites it in the data
 * dir, then rebuilds so `site.Data`/`hugo.Data` reflect the edit for the next
 * component render.
 *
 * @param {string} apiPath - Root-relative source path from the event
 */
async function updateDatasetFile(apiPath) {
	let data;
	try {
		data = await CloudCannon?.file?.(apiPath)?.data?.get?.();
	} catch (error) {
		warn(`Failed to read dataset file ${apiPath}:`, error);
		return;
	}
	if (data === undefined || data === null) return;
	/** @type {any} */ (globalThis).writeHugoFiles(
		JSON.stringify({
			[rootRelativePath(apiPath)]: serializeDataset(data, apiPath),
		}),
	);
	rebuildEditorSite();
}

/**
 * Drops a deleted content file's stub from the editor site and rebuilds so
 * collections lose the page. The session's edit target keeps its stub — its
 * opt-in is what the render chain reads, and a deleted edit target is a page
 * the editor is already tearing down. The home page is protected by the
 * renderer itself (removeHugoFiles refuses the home file).
 *
 * @param {string} apiPath - Root-relative source path from the event
 */
async function removeContentStub(apiPath) {
	const filePath = rootRelativePath(apiPath);
	if (!filePath) return;
	if (filePath === sessionFile) {
		log(
			`Keeping the stub for ${apiPath} — it's the page being edited ` +
				"(the session render target)",
		);
		return;
	}
	/** @type {any} */ (globalThis).removeHugoFiles?.(JSON.stringify([filePath]));
	rebuildEditorSite();
}

/**
 * Drops a deleted dataset file from the data dir and rebuilds so site data
 * loses it.
 *
 * @param {string} apiPath - Root-relative source path from the event
 */
async function removeDatasetFile(apiPath) {
	/** @type {any} */ (globalThis).removeHugoFiles?.(
		JSON.stringify([rootRelativePath(apiPath)]),
	);
	rebuildEditorSite();
}

/**
 * Serializes a dataset file's contents for the data dir by extension. YAML
 * files become the runtime's typed YAML; JSON files stay JSON (numbers
 * decode to float64 there, matching Hugo's native JSON data decoding). Other
 * extensions fall back to YAML — a documented first-pass gap, since the API
 * only exposes parsed data (original formatting is unrecoverable).
 *
 * @param {Record<string, any> | any[]} data
 * @param {string} apiPath
 * @returns {string}
 */
function serializeDataset(data, apiPath) {
	if (String(apiPath).endsWith(".json")) {
		return `${JSON.stringify(data, null, 2)}\n`;
	}
	return serializeData(data);
}

/**
 * Serializes a page's stub from its front matter, adding the session
 * target's publishing opt-in (`build.render: "always"` under the render-link
 * cascade). The home page's publishing is the renderer's config cascade, so
 * the browser only ever opts in the file being edited.
 *
 * @param {Record<string, any>} frontMatter
 * @param {string} filePath
 */
function stubContents(frontMatter, filePath) {
	return serializeFrontMatter(
		filePath === sessionFile
			? { ...frontMatter, build: { render: "always" } }
			: frontMatter,
	);
}

/** Runs an incremental build so Hugo re-reads changed stub files. */
function rebuildEditorSite() {
	const result = /** @type {any} */ (globalThis).rebuildHugoEditorSite?.();
	if (result?.error) {
		warn(
			"Failed to rebuild the editor site after a content change:",
			result.error,
		);
	}
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
		// Suppress per-page output: pages stay in the store (site.Pages, .GetPage,
		// .RelPermalink and .Content all keep working) but only pages opted back
		// in with build.render: always — the home page and the current edit
		// target — emit HTML. Rendering N stubs per rebuild is what this cascade
		// avoids, and the renderer only reads the target's output.
		cascade: {
			build: { render: "link" },
		},
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
 * Builds the `(props) => HTMLElement` renderer the shared core calls.
 *
 * @param {string} key - Component key from `data-component` (or an explicit
 * partial name when pinned via registerHugoComponent)
 * @returns {(props: Record<string, any>) => Promise<HTMLElement>}
 */
function createComponentRenderer(key) {
	return async (props) => {
		await ensureEngine();

		// The render request carries the key as the partial name; Hugo's own
		// lookup resolves it (extension optional, nested paths included), and
		// a missing partial errors inside the dispatch layout's
		// templates.Exists check with a clean message.
		const partial = key;

		group(`Rendering Hugo component: ${key}`);
		log("Partial:", partial, "Props:", props);

		// Every render targets the session file captured at boot (navigating
		// to another page reboots the editor). Its stub was opted into
		// publishing at boot, so writing the dispatch page is the only thing
		// that needs to happen per render — the current page re-renders via
		// its dependency on the dispatch page, and the renderer reads the
		// built page whose file path matches the target.
		const result = /** @type {any} */ (globalThis).renderHugoPartial(
			JSON.stringify({
				partial,
				props: props ?? {},
				target: sessionFile,
			}),
		);

		// The dispatch layout renders a missing-partial marker element when
		// its templates.Exists check finds no such name — turn it into the
		// clean component error.
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
 * Wraps `window.cc_components` in a Proxy that manufactures a renderer for
 * any component name on demand; partial existence is decided by the Hugo
 * renderer at render time. Explicitly registered names take precedence.
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
