export interface LiquidOptions {
	/** Directories to walk for component templates. Defaults to `[directories.includes, directories.input]`. */
	componentDirs?: string[];
	/** Template file extensions to bundle. Defaults to `[".liquid", ".html"]`. */
	extensions?: string[];
	/** Directory names to skip when walking. Defaults to `[directories.output, "node_modules"]`. */
	ignoreDirectories?: string[];
	/** Map of component name → module path. Wins over the auto-discovered components. */
	components?: Record<string, string>;
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
	/**
	 * Ship a build-time `inputPath -> { url, outputPath }` map in the bundle
	 * so the page / collections proxies and the `inputPathToUrl` filter can
	 * resolve correctly for permalinks computed by JS config or
	 * `eleventyComputed`. Default `true`. Set to `false` on very large sites
	 * where the bundle-size cost (~100 bytes per page) outweighs the
	 * accuracy win.
	 */
	pageMap?: boolean;
}

export interface PluginOptions {
	/** Output path for the generated bundle. Defaults to `register-components.js` inside Eleventy's `dir.output`. */
	output?: string;
	/** Enable verbose browser logging. */
	verbose?: boolean;
	/**
	 * Liquid is the plugin's default language and is enabled implicitly.
	 * Pass `false` to disable, `true` for defaults, or an options object
	 * for customisation.
	 */
	liquid?: LiquidOptions | boolean;
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

/**
 * Internal shape after `normalizePluginOptions`: each supported language is
 * resolved to either an options object (enabled) or `false` (disabled). Same
 * shape as `PluginOptions` aside from that resolution.
 */
export type NormalizedPluginOptions = Omit<PluginOptions, "liquid"> & {
	liquid: LiquidOptions | false;
};

export default function (
	eleventyConfig: any,
	pluginOptions: PluginOptions,
): void;
