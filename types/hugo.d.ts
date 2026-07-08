declare module "@cloudcannon/editable-regions/hugo/browser" {
	export interface HugoRuntimeData {
		/** Template snapshot: project-relative path → source. */
		files: Record<string, string>;
		/** Data file snapshot: project-relative path → source. */
		data: Record<string, string>;
		/** Normalized site config (baseURL, title, params, menus). */
		config: Record<string, any>;
		/** Page map: input path → { url, title, kind }. */
		pages: Record<string, { url: string; title: string; kind: string }>;
		/** Emitter metadata: { generator, wasmUrl, verbose }. */
		meta: Record<string, any>;
	}

	/**
	 * Boots Hugo live editing from the `window.cc_hugo*` globals emitted by
	 * the Hugo module's output-format template. Installs the component proxy
	 * immediately; the WASM renderer loads once the CloudCannon Visual Editor
	 * API appears.
	 */
	export function initHugoLiveEditing(
		options?: Partial<HugoRuntimeData> & { wasmUrl?: string },
	): void;

	/** Starts (or returns the in-flight start of) the WASM renderer. */
	export function ensureEngine(): Promise<void>;

	/**
	 * Pins a component renderer under `key`, optionally to an explicit
	 * partial. Takes precedence over the on-demand proxy resolution.
	 */
	export function registerHugoComponent(
		key: string,
		partialName?: string,
	): void;

	/**
	 * Resolves a component key to a partial name against the bundled
	 * template snapshot, or `null` when no template matches.
	 */
	export function resolvePartialName(key: string): string | null;

	/**
	 * Wraps `window.cc_components` in a Proxy resolving any component name
	 * on demand against the partial snapshot. Called by
	 * `initHugoLiveEditing`.
	 */
	export function initComponentProxy(): void;
}

/** Window globals emitted by the Hugo module's output-format template. */
declare global {
	interface Window {
		/** Emitter metadata: generator, wasmUrl, verbose. */
		cc_hugo?: Record<string, any>;
		/** Template snapshot keyed by project-relative path. */
		cc_hugo_files?: Record<string, string>;
		/** Data file snapshot keyed by project-relative path. */
		cc_hugo_data?: Record<string, string>;
		/** Normalized site config. */
		cc_hugo_config?: Record<string, any>;
		/** Page map keyed by input path. */
		cc_hugo_pages?: Record<
			string,
			{ url: string; title: string; kind: string }
		>;
	}
}

export {};
