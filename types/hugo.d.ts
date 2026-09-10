import type {
	CloudCannonVisualEditorAPIRouter,
	CloudCannonVisualEditorAPIV0,
	CloudCannonVisualEditorAPIV1,
} from "@cloudcannon/visual-editor-api";

declare module "@cloudcannon/editable-regions/hugo/browser" {
	/**
	 * Boots Hugo live editing from the `window.cc_hugo*` globals emitted by
	 * the Hugo module's snapshot prelude. Installs the component proxy
	 * immediately; the WASM renderer loads once the CloudCannon Visual Editor
	 * API appears.
	 */
	export function initHugoLiveEditing(): void;

	/** Starts (or returns the in-flight start of) the WASM renderer. */
	export function ensureEngine(): Promise<void>;

	/**
	 * Wraps `window.cc_components` in a Proxy manufacturing a renderer for
	 * any component name on demand; partial existence is decided by the Hugo
	 * renderer at render time. Called by `initHugoLiveEditing`.
	 */
	export function initComponentProxy(): void;
}

declare global {
	/** Snapshot metadata emitted onto `window.cc_hugo` by the module's prelude. */
	interface HugoRuntimeMeta {
		generator?: string;
		wasmUrl?: string;
		verbose?: boolean;
		env?: string;
	}

	/** Result from the editor-site mutation entry points. */
	interface HugoEditorResult {
		error?: string;
	}

	/** Result from `renderHugoPartials`. */
	interface HugoRenderResult {
		html?: string;
		error?: string;
	}

	/**
	 * The Hugo runtime's `window` doubles as the CloudCannon Visual Editor
	 * window and carries the snapshot globals emitted by the module's prelude.
	 */
	interface Window {
		/** CloudCannon's versioned API router (present inside the Visual Editor). */
		CloudCannonAPI?: CloudCannonVisualEditorAPIRouter;
		/** The installed v0/v1 CloudCannon API for this page. */
		CloudCannon?: CloudCannonVisualEditorAPIV0 | CloudCannonVisualEditorAPIV1;
		/** Emitter metadata: generator, wasmUrl, verbose, env. */
		cc_hugo?: HugoRuntimeMeta;
		/** Template/config snapshot keyed by physical path. */
		cc_hugo_files?: Record<string, string>;
	}

	// The Hugo WASM renderer exposes these functions on `globalThis` once it
	// boots; the runtime calls them directly after the engine is ready.
	function writeHugoFiles(json: string): HugoEditorResult | null;
	function removeHugoFiles(json: string): HugoEditorResult | null;
	function readHugoFiles(json: string): Record<string, string>;
	function initHugoEditorSite(): HugoEditorResult | null;
	function renderHugoPartials(json: string): HugoRenderResult | null;
}
