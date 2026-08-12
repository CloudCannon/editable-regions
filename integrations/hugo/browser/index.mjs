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
import { serializeFrontMatter } from "./serialize-yaml.mjs";

/** Kinds the editor site never renders; disabling them trims every rebuild. */
const DISABLED_KINDS = [
	"taxonomy",
	"term",
	"RSS",
	"sitemap",
	"robotsTXT",
	"404",
];

/** Partials prefix relative to the snapshot: the site's layoutDir + partials. */
function partialsPrefix() {
	return `${runtimeData?.config?.layoutDir ?? "layouts"}/partials/`;
}

/** The site's configured content directory ("content" by default). */
function contentDir() {
	return runtimeData?.config?.contentDir ?? "content";
}

/** Content file extensions Hugo recognizes; everything else is ignored when loading editor content. */
const CONTENT_EXTENSIONS = [".md", ".markdown", ".mdown", ".html", ".htm"];

/**
 * Parsed front matter for every content file loaded from the CloudCannon
 * API at boot, keyed by the Hugo page path ("/blog/one/"). The parallel map
 * resolves a page path back to its project-relative source file
 * ("blog/one.md") so the runtime can rewrite stubs for the edit target.
 */
const contentFrontMatter = new Map();

/** Hugo page path -> project-relative content file ("blog/one.md"). */
const pagePathFiles = new Map();

/**
 * The page being edited, captured once at boot from the CloudCannon API.
 * Navigating to another page reboots the editor (a fresh page load), so the
 * target never changes mid session — the renderer reads this page's output
 * and this page's stub was opted into publishing when content loaded.
 * @type {string}
 */
let sessionPage = "/";

/**
 * Maps a CloudCannon API file path ("/content/blog/one.md") to its Hugo page
 * path ("/blog/one/"). `_index`/`index` files become their parent page (or
 * "/"), and each segment is slugified like Hugo's `urlize` (lowercased,
 * non-alphanumerics collapsed to "-"). Exotic filenames (unicode, spaces in
 * the source tree) may diverge from Hugo's urls — first-pass limitation.
 *
 * @param {string | undefined} apiPath
 * @returns {string | null} The Hugo page path, or null when not under contentDir
 */
function toHugoPagePath(apiPath) {
	const rel = String(apiPath ?? "")
		.replace(/^\/+/, "")
		.replace(/\\/g, "/");
	const prefix = `${contentDir()}/`;
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
 * Project-relative source file ("blog/one.md") for an API path, or null when
 * not under contentDir.
 * @param {string | undefined} apiPath
 */
function relContentFile(apiPath) {
	const rel = String(apiPath ?? "")
		.replace(/^\/+/, "")
		.replace(/\\/g, "/");
	const prefix = `${contentDir()}/`;
	if (!rel.startsWith(prefix)) return null;
	return rel.slice(prefix.length);
}

/**
 * @typedef {Object} HugoRuntimeData
 * @property {Record<string, string>} files - Template snapshot, project-relative paths
 * @property {Record<string, string>} data - Data file snapshot, project-relative paths
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
		data: options.data ?? win.cc_hugo_data ?? {},
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
		...runtimeData.data,
	};
	/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(files));

	// Content stubs (front matter only, blank bodies) land on the filesystem
	// before the site is created, so the editor site is built with the full
	// page tree present from the start — no incremental content-add path.
	await loadEditorContent();

	const initError = /** @type {any} */ (globalThis).initHugoEditorSite();
	if (initError?.error) {
		groupEnd();
		throw new Error(`Hugo editor site failed to build: ${initError.error}`);
	}

	log("Hugo renderer ready");
	groupEnd();
}

/**
 * Loads the front matter of every content file from the CloudCannon API and
 * writes it as a stub content file with a blank body — the first-pass content
 * model: real page data, no bodies (decision 10). The home page's stub also
 * carries build.render: "always" so it keeps publishing under the cascade.
 */
async function loadEditorContent() {
	if (!CloudCannon?.files) return;
	// The page being edited is fixed for the session (navigation reboots the
	// editor and re-runs this), so capture it once at boot: the loader opts
	// that page's stub into publishing. The home page is always opted in —
	// it's the boot surface and the fallback target when no page is current.
	sessionPage = toHugoPagePath(CloudCannon.currentFile?.()?.path) ?? "/";
	let listing;
	try {
		listing = await CloudCannon.files();
	} catch (error) {
		warn("Failed to list editor files, content will be unavailable:", error);
		return;
	}
	const stubs = /** @type {Record<string, string>} */ ({});
	for (const file of listing ?? []) {
		const apiPath = file?.path;
		if (!relContentFile(apiPath)) continue;
		if (!CONTENT_EXTENSIONS.some((ext) => String(apiPath).endsWith(ext)))
			continue;
		let frontMatter;
		try {
			frontMatter = await file?.data?.get?.();
		} catch (error) {
			warn(`Failed to read front matter for ${apiPath}:`, error);
			continue;
		}
		if (!frontMatter || typeof frontMatter !== "object") continue;
		const page = toHugoPagePath(apiPath);
		if (!page) continue;
		contentFrontMatter.set(page, frontMatter);
		pagePathFiles.set(page, relContentFile(apiPath));
		const optsIntoPublishing = page === "/" || page === sessionPage;
		stubs[`${contentDir()}/${relContentFile(apiPath)}`] = serializeFrontMatter(
			optsIntoPublishing
				? { ...frontMatter, build: { render: "always" } }
				: frontMatter,
		);
	}
	if (Object.keys(stubs).length > 0) {
		log(
			`Loading editor content: ${Object.keys(stubs).length} content files` +
				(sessionPage === "/" ? "" : ` (editing ${sessionPage})`),
		);
		/** @type {any} */ (globalThis).writeHugoFiles(JSON.stringify(stubs));
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
