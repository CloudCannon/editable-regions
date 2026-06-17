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
	 * Path to the Eleventy config file, used to auto-mirror its helpers into
	 * the browser bundle. Resolved relative to the project root. Defaults to
	 * the first of 11ty's standard names that exists (`.eleventy.js`,
	 * `eleventy.config.{js,mjs,cjs}`). Set this only if you run Eleventy with a
	 * non-default `--config` path.
	 */
	configPath?: string;
	/**
	 * Extra bare module specifiers to stub out of the browser bundle, on top of
	 * the 11ty toolchain and Node built-ins (always stubbed). Use this when the
	 * config imports a native/Node-only package (e.g. `sharp`) that no
	 * browser-bound helper actually calls at render time but that would
	 * otherwise break bundling.
	 */
	browserStub?: string[];
	/**
	 * Browser-side filter overrides: filter name → module path. The config's
	 * filters are auto-mirrored into the browser by bundling the real config,
	 * so closures and imports survive. Use an override only when a filter
	 * genuinely can't run in the browser (it calls a Node API at render time);
	 * the override replaces it and its name is excluded from the mirror.
	 */
	filters?: Record<string, string>;
	/** Browser-side shortcode overrides. Same auto-mirror + override model as `filters`. */
	shortcodes?: Record<string, string>;
	/** Browser-side paired-shortcode overrides. Same auto-mirror + override model as `filters`. */
	pairedShortcodes?: Record<string, string>;
	/**
	 * Browser-side custom Liquid tag overrides: tag name → module path
	 * (default-exporting a `(engine) => { parse, render }` factory). Tags are
	 * auto-mirrored from the config like filters/shortcodes; supply an override
	 * here only for a tag that can't run in the browser as written.
	 */
	tags?: Record<string, string>;
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
	 * Extra globals to expose to editor-rendered templates, mirroring whatever
	 * global data your build already provides (via `_data/` or
	 * `addGlobalData`). Embedded into the bundle at build time, so values must
	 * be JSON-serialisable. To surface env vars, pass them in explicitly, e.g.
	 * `globals: { env: { API_BASE: process.env.API_BASE } }`, and register the
	 * same data server-side so the editor and build agree. Don't include secrets.
	 */
	globals?: Record<string, unknown>;
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
