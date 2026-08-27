declare module "@cloudcannon/editable-regions/hugo/browser" {
	export interface HugoRuntimeData {
		/** Template snapshot: canonical layouts/ path → source. */
		files: Record<string, string>;
		/** Normalized site config (baseURL, title, params, menus). */
		config: Record<string, any>;
		/** Emitter metadata: { generator, wasmUrl, verbose }. */
		meta: Record<string, any>;
	}

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

/** Window globals emitted by the Hugo module's snapshot prelude. */
declare global {
	interface Window {
		/** Emitter metadata: generator, wasmUrl, verbose. */
		cc_hugo?: Record<string, any>;
		/** Template snapshot keyed by canonical layouts/ path. */
		cc_hugo_files?: Record<string, string>;
		/** Normalized site config (no directory keys; dirs are defaulted). */
		cc_hugo_config?: Record<string, any>;
	}
}

export {};
