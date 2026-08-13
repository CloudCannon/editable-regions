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

/** Partials prefix in the snapshot: the editor site always uses the default layoutDir. */
function partialsPrefix() {
	return "layouts/partials/";
}

/**
 * Memfs key for a mirrored file: the API's site-root-relative source path
 * with the leading slash removed ("/content/blog/one.md" ->
 * "content/blog/one.md"). The editor site uses Hugo's default dirs, so
 * verbatim mirroring lands the standard content/data trees exactly where
 * Hugo reads them; relocated trees keep their segments (a documented
 * first-pass gap until config mirroring lands).
 * @param {string} apiPath
 * @returns {string}
 */
function rootRelativePath(apiPath) {
	return String(apiPath ?? "")
		.replace(/^\/+/, "")
		.replace(/\\/g, "/");
}

/**
 * The page being edited, captured once at boot from the CloudCannon API.
 * Navigating to another page reboots the editor (a fresh page load), so the
 * target never changes mid session — the renderer reads this page's output
 * and this page's stub was opted into publishing when content loaded.
 * @type {string}
 */
let sessionPage = "/";

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
 * Maps a CloudCannon API file path ("/content/blog/one.md") to its Hugo page
 * path ("/blog/one/"). `_index`/`index` files become their parent page (or
 * "/"), and each segment is slugified like Hugo's `urlize` (lowercased,
 * non-alphanumerics collapsed to "-"). Exotic filenames (unicode, spaces in
 * the source tree) may diverge from Hugo's urls — first-pass limitation.
 * Mirrored files keyed verbatim under the editor's default content dir, so
 * the page path is the path relative to "content/" (matching how a standard
 * site's content maps to pages). Files outside content/ resolve to null —
 * the editor doesn't render them until config mirroring lands.
 *
 * @param {string | undefined} apiPath
 * @returns {string | null} The Hugo page path, or null when not under the default content dir
 */
function toHugoPagePath(apiPath) {
	const rel = String(apiPath ?? "")
		.replace(/^\/+/, "")
		.replace(/\\/g, "/");
	const prefix = "content/";
	if (!rel.startsWith(prefix)) return null;
	let file = rel
		.slice(prefix.length)
		.replace(/\.(md|markdown|mdown|html|htm)$/i, "");
	if (file === "_index" || file === "index") return "/";
	if (file.endsWith("/_index") || file.endsWith("/index")) {
		file = file.slice(0, file.lastIndexOf("/"));
	} else if (file.startsWith("_index/") || file.startsWith("index/")) {
		file = file.slice("_index".length);
	}
	const slugged = file.split("/").map(urlizeSegment).filter(Boolean).join("/");
	if (!slugged) return "/";
	return `/${slugged}/`;
}

/** @param {string} segment */
function urlizeSegment(segment) {
	return segment
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

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
		"config.json": JSON.stringify(buildEditorConfig(runtimeData.config)),
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
 * them; relocated trees keep their segments until config mirroring lands (a
 * documented first-pass gap). The home page's stub also carries
 * build.render: "always" so it keeps publishing under the cascade.
 */
async function loadEditorCollectionData() {
	if (!CloudCannon) return;
	// The page being edited is fixed for the session (navigation reboots the
	// editor and re-runs this), so capture it once at boot: the loader opts
	// that page's stub into publishing. The home page is always opted in —
	// it's the boot surface and the fallback target when no page is current.
	sessionPage = toHugoPagePath(CloudCannon.currentFile?.()?.path) ?? "/";

	const files = /** @type {Record<string, string>} */ ({});
	editorCollections = [];
	editorDatasets = [];

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
				const page = toHugoPagePath(apiPath);
				if (!apiPath || !page) continue;
				let frontMatter;
				try {
					frontMatter = await file?.data?.get?.();
				} catch (error) {
					warn(`Failed to read front matter for ${apiPath}:`, error);
					continue;
				}
				if (!frontMatter || typeof frontMatter !== "object") continue;
				files[rootRelativePath(apiPath)] = stubContents(frontMatter, page);
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
				(sessionPage === "/" ? "" : ` (editing ${sessionPage})`),
		);
		/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));
	}
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

	const page = toHugoPagePath(apiPath);
	if (!page) return;
	/** @type {any} */ (globalThis).writeHugoFiles(
		JSON.stringify({
			[rootRelativePath(apiPath)]: stubContents(frontMatter, page),
		}),
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
 * collections lose the page. The home page and the session's edit target keep
 * their stubs — they're the publish opt-ins the whole render chain depends on,
 * and a deleted edit target is a page the editor is already tearing down.
 *
 * @param {string} apiPath - Root-relative source path from the event
 */
async function removeContentStub(apiPath) {
	const page = toHugoPagePath(apiPath);
	if (!page) return;
	if (page === "/" || page === sessionPage) {
		log(
			`Keeping the stub for ${apiPath} — it's a publish opt-in target ` +
				"(the home page or the page being edited)",
		);
		return;
	}
	/** @type {any} */ (globalThis).removeHugoFiles?.(
		JSON.stringify([rootRelativePath(apiPath)]),
	);
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
 * Serializes a page's stub from its front matter, adding the publishing
 * opt-in (`build.render: "always"` under the render-link cascade) for the
 * home page and the session's edit target — the two pages that ever publish.
 *
 * @param {Record<string, any>} frontMatter
 * @param {string} page
 */
function stubContents(frontMatter, page) {
	return serializeFrontMatter(
		page === "/" || page === sessionPage
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
	const prefix = partialsPrefix();
	const candidates = [key, `${key}.html`, `${key}.htm`];
	for (const candidate of candidates) {
		if (`${prefix}${candidate}` in files) {
			return candidate;
		}
	}
	return null;
}

/** @returns {string[]} Partial names available in the snapshot. */
function availablePartials() {
	const prefix = partialsPrefix();
	return Object.keys(runtimeData?.files ?? {})
		.filter((path) => path.startsWith(prefix))
		.map((path) => path.slice(prefix.length));
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

		// Every render targets the session page captured at boot (navigating
		// to another page reboots the editor). Its stub was opted into
		// publishing at boot, so writing the dispatch page is the only thing
		// that needs to happen per render — the current page re-renders via
		// its dependency on the dispatch page.
		const result = /** @type {any} */ (globalThis).renderHugoPartial(
			JSON.stringify({
				partial,
				props: props ?? {},
				page: sessionPage,
			}),
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
