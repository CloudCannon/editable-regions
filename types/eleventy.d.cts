interface LiquidOptions {
	/** Directories to walk for component templates. Defaults to `[directories.includes, directories.input]`. */
	componentDirs?: string[];
	/** Template file extensions to bundle. Defaults to `[".liquid", ".html"]`. */
	extensions?: string[];
	/** Directory names to skip when walking. Defaults to `[directories.output, "node_modules"]`. */
	ignoreDirectories?: string[];
	/** Map of component name → module path. Wins over the proxy fallback. */
	componentOverrides?: Record<string, string>;
	/**
	 * Browser-side filter overrides: filter name → module path. Use when an
	 * auto-mirrored filter relies on Eleventy build-time state (`this.ctx`,
	 * `process`, `require`, `__dirname`) and throws in the browser.
	 */
	filters?: Record<string, string>;
	/** Browser-side shortcode overrides. Same auto-mirror + override model as `filters`. */
	shortcodes?: Record<string, string>;
	/** Browser-side paired-shortcode overrides. Same auto-mirror + override model as `filters`. */
	pairedShortcodes?: Record<string, string>;
	/**
	 * Custom Liquid tags to register in the browser engine: tag name → module
	 * path. Unlike filters/shortcodes, tags are not auto-mirrored — register
	 * any tag you want available during live editing here.
	 */
	tags?: Record<string, string>;
}

interface PluginOptions {
	/** Output path for the generated bundle. Defaults to `<output>/live-editing.js`. */
	output?: string;
	/** Enable verbose browser logging. */
	verbose?: boolean;
	/** Liquid template options. Omit to disable Liquid live editing entirely. */
	liquid?: LiquidOptions;
	/**
	 * Allowlist of `process.env` names to expose to live-editing templates as
	 * `process.env.NAME`. Read from the host `process.env` at build time and
	 * embedded in the bundle as static literals. Don't list secrets.
	 */
	env?: string[];
	/**
	 * Auto-include any `process.env.NAME` whose name starts with this prefix,
	 * alongside `env`. Empty strings are rejected to prevent accidental
	 * full-environment leaks.
	 */
	envPrefix?: string;
}

declare function editableRegions(
	eleventyConfig: any,
	pluginOptions: PluginOptions,
): void;
export = editableRegions;
