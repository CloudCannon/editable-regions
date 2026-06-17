import fs from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import esbuild from "esbuild";
import { createIncludeWithTag } from "../liquid/include-with-tag.mjs";
import {
	builtinFilterNames,
	builtinShortcodeNames,
} from "./browser/builtin-names.mjs";

/**
 * @typedef {import("../../types/eleventy").LiquidOptions} LiquidOptions
 * @typedef {import("../../types/eleventy").PluginOptions} PluginOptions
 * @typedef {import("../../types/eleventy").NormalizedPluginOptions} NormalizedPluginOptions
 */

/**
 * @typedef {Object} EleventyDirectories
 * @property {string} input
 * @property {string} includes - Normalized, relative to project root
 * @property {string} data
 * @property {string} output
 */

/**
 * Payload Eleventy passes to `eleventy.after` handlers. `directories` is the
 * Eleventy 3.x shape; `dir` is the older fallback we still accept.
 *
 * @typedef {Object} EleventyEventPayload
 * @property {EleventyDirectories} [directories]
 * @property {EleventyDirectories} [dir]
 * @property {Array<{inputPath?: string, outputPath?: string, url?: string}>} [results]
 */

/**
 * A Liquid tag factory: invoked once by LiquidJS with the engine, returns
 * the `{ parse, render }` pair LiquidJS calls per occurrence. Matches the
 * shape `eleventyConfig.addLiquidTag` documents.
 *
 * @typedef {(liquidEngine: import("liquidjs").Liquid) => { parse: (...args: any[]) => void, render: (...args: any[]) => unknown }} LiquidTagFactory
 */

/**
 * Eleventy lifecycle event names we know about. Eleventy ships more, but we
 * only subscribe to `eleventy.after`. Stays as a union of known names so
 * typos surface at the typedef level.
 *
 * @typedef {"eleventy.before" | "eleventy.after" | "eleventy.beforeWatch" | "eleventy.beforeConfig"} EleventyEventName
 */

/**
 * Shape we use from Eleventy's user config object. Eleventy itself doesn't
 * ship types and the DefinitelyTyped coverage is incomplete, so we declare
 * only the surface we actually touch. Anything else accessed on the config
 * is a typing hole.
 *
 * @typedef {Object} EleventyConfig
 * @property {(name: string, factory: LiquidTagFactory) => void} addLiquidTag - Register a custom Liquid tag
 * @property {(event: EleventyEventName, handler: (payload: EleventyEventPayload) => Promise<void> | void) => void} on - Register an event handler
 * @property {EleventyDirectories} dir - Directory configuration
 */

/**
 * Eleventy plugin for CloudCannon editable regions. Registers Liquid tags
 * and builds the live-editing client bundle.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {PluginOptions} [pluginOptions]
 */
export default function editableRegionsPlugin(eleventyConfig, pluginOptions) {
	const options = normalizePluginOptions(pluginOptions);

	// No supported languages enabled — nothing to register or bundle.
	if (!options.liquid) return;
	const liquidOptions = options.liquid;

	eleventyConfig.addLiquidTag("includeWith", createIncludeWithTag);

	eleventyConfig.on("eleventy.after", async ({ directories, dir, results }) => {
		// `directories` is the 11ty 3.x event-payload shape; `dir` is the
		// legacy shape (still passed in 3.x). `eleventyConfig.dir` is the
		// same legacy shape reached via the config closure — last-resort
		// fallback for any 11ty version that doesn't pass it on the event.
		const dirs = directories ?? dir ?? eleventyConfig.dir;

		const rawExtensions = liquidOptions.extensions ?? [".liquid", ".html"];
		const normalizedExtensions = rawExtensions.map((ext) =>
			ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
		);

		const liveEditingSource = await generateLiveEditingSource(
			options,
			dirs,
			normalizedExtensions,
			results,
		);

		// esbuild only matches the final extension, so .bookshop.liquid -> .liquid
		/** @type {Record<string, import('esbuild').Loader>} */
		const loader = {};
		for (const ext of normalizedExtensions) {
			loader[ext.slice(ext.lastIndexOf("."))] = "text";
		}

		await esbuild.build({
			stdin: {
				contents: liveEditingSource,
				resolveDir: process.cwd(),
			},
			loader,
			bundle: true,
			platform: "browser",
			// The bundle imports the user's real Eleventy config (so its helper
			// closures survive — see `emitConfigMirror`). The config drags in
			// Node/build-time imports we must keep out of the browser bundle;
			// stub them so the `import`s resolve but throw if actually called.
			plugins: [createBrowserStubPlugin(liquidOptions.browserStub)],
			outfile: options.output ?? `${dirs.output}/register-components.js`,
		});
	});
}

/**
 * Each supported language resolves to an options object (enabled) or `false`
 * (disabled). Liquid is the default and is enabled implicitly — only
 * `liquid: false` opts out. Future languages default to off.
 *
 * @param {PluginOptions | undefined} pluginOptions
 * @returns {NormalizedPluginOptions}
 */
function normalizePluginOptions(pluginOptions) {
	const opts = pluginOptions ?? {};
	return {
		...opts,
		liquid: /** @type {LiquidOptions | false} */ (
			normalizeLanguageOption(opts.liquid, { defaultOn: true })
		),
		// Future opt-in language follows the same shape, but defaults to off:
		//
		// nunjucks: /** @type {NunjucksOptions | false} */ (
		//   normalizeLanguageOption(opts.nunjucks, { defaultOn: false })
		// ),
	};
}

/**
 * Resolves a per-language option:
 *   - `false` → disabled
 *   - `true` → enabled with default options
 *   - object → enabled with those options
 *   - `undefined` → uses `defaultOn` (Liquid defaults on; future langs off)
 *
 * @template {object} Options
 * @param {Options | boolean | undefined} value
 * @param {{ defaultOn: boolean }} opts
 * @returns {Options | false}
 */
function normalizeLanguageOption(value, { defaultOn }) {
	if (value === false) return false;
	if (value === true) return /** @type {Options} */ ({});
	if (value == null) return defaultOn ? /** @type {Options} */ ({}) : false;
	return value;
}

/**
 * Bare specifiers that must never end up in the browser bundle: the 11ty
 * toolchain (and its subpaths) and the editable-regions Node plugin itself.
 * NOT `@cloudcannon/editable-regions/eleventy/browser` or `.../liquid` — those
 * are the real browser runtime and must bundle normally.
 */
const ALWAYS_STUBBED = [
	"@11ty/eleventy",
	"@cloudcannon/editable-regions/eleventy",
];

/**
 * esbuild plugin that resolves Node built-ins and known build-time-only
 * packages to a Proxy that survives `import` and property access but throws
 * the moment it's *called* or *constructed*. This lets the user's Eleventy
 * config bundle for the browser: top-level `import { EleventyRenderPlugin }
 * from "@11ty/eleventy"` resolves to a harmless stub, and only a helper that
 * actually invokes a Node API at render time fails (which it must — it can't
 * run in a browser).
 *
 * @param {string[]} [extraStubs] - Additional bare specifiers to stub, from
 *   `pluginOptions.liquid.browserStub` (escape hatch for native deps like
 *   `sharp` that a config imports but no browser-bound helper calls).
 * @returns {import('esbuild').Plugin}
 */
function createBrowserStubPlugin(extraStubs = []) {
	const nodeBuiltins = new Set([
		...builtinModules,
		...builtinModules.map((m) => `node:${m}`),
	]);
	const bareStubs = [...ALWAYS_STUBBED, ...extraStubs];

	const shouldStub = (/** @type {string} */ id) => {
		if (nodeBuiltins.has(id)) return true;
		// `@11ty/eleventy` and any subpath; the editable-regions plugin entry
		// exactly (its `/browser` + `/liquid` subpaths are real browser code).
		if (id === "@11ty/eleventy" || id.startsWith("@11ty/eleventy/"))
			return true;
		return bareStubs.some((b) => id === b);
	};

	return {
		name: "editable-regions-browser-stub",
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) =>
				shouldStub(args.path)
					? { path: args.path, namespace: "er-stub" }
					: null,
			);
			build.onLoad({ filter: /.*/, namespace: "er-stub" }, () => ({
				contents: `
					const handler = {
						get: () => new Proxy(function () {}, handler),
						apply: () => {
							throw new Error("editable-regions: a Node/build-time API was called in the browser live-editing bundle. Provide a browser-friendly override via pluginOptions.liquid.<kind>.");
						},
						construct: () => {
							throw new Error("editable-regions: a Node/build-time API was constructed in the browser live-editing bundle. Provide a browser-friendly override via pluginOptions.liquid.<kind>.");
						},
					};
					module.exports = new Proxy(function () {}, handler);
				`,
				loader: "js",
			}));
		},
	};
}

/**
 * Resolves the path to the user's Eleventy config file so the live-editing
 * bundle can import it. 11ty doesn't expose the config path on the
 * `eleventyConfig` object plugins receive, so we resolve it ourselves: an
 * explicit `pluginOptions.liquid.configPath`, else the first of 11ty's
 * default config filenames that exists in the project root.
 *
 * @param {LiquidOptions} liquidOptions
 * @returns {string | null} Absolute path, or `null` if none found
 */
function resolveEleventyConfigPath(liquidOptions) {
	if (liquidOptions.configPath) {
		return path.resolve(process.cwd(), liquidOptions.configPath);
	}
	// Matches 11ty's default resolution order (TemplateConfig.js).
	const defaults = [
		".eleventy.js",
		"eleventy.config.js",
		"eleventy.config.mjs",
		"eleventy.config.cjs",
	];
	for (const name of defaults) {
		const candidate = path.resolve(process.cwd(), name);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Emits the import of the user's Eleventy config plus the call that replays it
 * in the browser to auto-mirror its filters/shortcodes/paired-shortcodes/tags
 * (see `collectAndRegisterEleventyHelpers`). Importing the real config means
 * esbuild bundles each helper with its closures and imports intact.
 *
 * Skips two name sets per kind: handwritten browser ports (so those win) and
 * names overridden via `pluginOptions.liquid.<kind>` (emitted separately by
 * `emitImportRegistrations` so the override wins).
 *
 * @param {string} configPath - Absolute path to the Eleventy config
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string} JS source
 */
function emitConfigMirror(configPath, liquidOptions) {
	const skip = {
		filters: [
			...builtinFilterNames,
			...Object.keys(liquidOptions?.filters ?? {}),
		],
		shortcodes: [
			...builtinShortcodeNames,
			...Object.keys(liquidOptions?.shortcodes ?? {}),
		],
		pairedShortcodes: Object.keys(liquidOptions?.pairedShortcodes ?? {}),
		tags: Object.keys(liquidOptions?.tags ?? {}),
	};

	return (
		`\nimport userEleventyConfig from ${JSON.stringify(configPath)};\n` +
		`collectAndRegisterEleventyHelpers(userEleventyConfig, ${JSON.stringify({ skip })});\n`
	);
}

/**
 * Builds the JS source for the live-editing client bundle. Emits imports
 * and `register*` calls for components, filters, shortcodes, and tags.
 *
 * @param {NormalizedPluginOptions} options
 * @param {EleventyDirectories} directories
 * @param {string[]} normalizedExtensions - Lowercase, leading-dot
 * @param {Array<{inputPath?: string, outputPath?: string, url?: string}> | undefined} results - From `eleventy.after`
 * @returns {Promise<string>}
 */
async function generateLiveEditingSource(
	options,
	directories,
	normalizedExtensions,
	results,
) {
	let source = "";

	if (options.liquid) {
		const liquidOptions = options.liquid;
		// `input` is included alongside `includes` so `{% include %}` from a
		// page template can reach sibling files in the input tree — not just
		// files in the dedicated includes dir.
		const componentDirs = liquidOptions.componentDirs ?? [
			directories.includes,
			directories.input,
		];
		const ignoreDirectories = liquidOptions.ignoreDirectories ?? [
			directories.output,
			"node_modules",
		];
		const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
			dir.toLowerCase(),
		);

		source += `
      import { createSharedLiquidEngine, registerLiquidComponent, registerFilter, registerShortcode, registerPairedShortcode, registerCustomTag, registerProcessEnv, registerEleventyData, registerPkg, registerPageMap, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';
      import { registerEleventyBuiltins, collectAndRegisterEleventyHelpers } from '@cloudcannon/editable-regions/eleventy/browser';

      setVerbose(${Boolean(options.verbose)});

			// Configure the Liquid engine with component directories
			const liquidEngine = createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

			// Wire up Eleventy's built-in filters/shortcodes (browser ports) +
			// RenderPlugin shims. This is what makes it behave like Eleventy; 
      // The engine itself is host-agnostic; 
			registerEleventyBuiltins(liquidEngine);

    	window.cc_liquid_files = {};
  `;

		// Build the filtered env object at build time and embed it as a static
		// literal. Reading process.env happens here, in Node — never in the
		// browser. Anything not in the allowlist or matching the prefix is
		// invisible to the bundle.
		const exposedEnv = collectExposedEnv(options.env, options.envPrefix);
		if (Object.keys(exposedEnv).length > 0) {
			source += `\nregisterProcessEnv(${JSON.stringify(exposedEnv)});\n`;
		}

		// Static `eleventy` global — version, generator, hardcoded env, and the
		// configured directories. Embedded as a literal so templates branching
		// on `eleventy.version` / `eleventy.env.runMode` see something sensible.
		const eleventyData = buildEleventyData(directories);
		source += `\nregisterEleventyData(${JSON.stringify(eleventyData)});\n`;

		// 11ty exposes the project's package.json as the `pkg` global by
		// default. We mirror that, minus the heavy fields (see `buildPkg`).
		const pkg = buildPkg();
		if (pkg) {
			source += `\nregisterPkg(${JSON.stringify(pkg)});\n`;
		}

		// Build-time page map: inputPath -> { url, outputPath }, extracted
		// from 11ty's `eleventy.after` `results` payload. Lets the page /
		// collections proxies and `inputPathToUrl` resolve correctly for
		// permalinks computed by JS config or `eleventyComputed`. Opt-out via
		// `liquid.pageMap: false` for very large sites where the bundle-size
		// cost outweighs the accuracy win.
		if (liquidOptions.pageMap !== false) {
			const pageMap = buildPageMap(results);
			if (Object.keys(pageMap).length > 0) {
				source += `\nregisterPageMap(${JSON.stringify(pageMap)});\n`;
			}
		}

		// Walk every liquid file under the component dirs (not just components
		// — anything `{% include %}`-able) and pre-populate `window.cc_liquid_files`.
		// LiquidJS's in-memory filesystem (see `integrations/liquid/fs.mjs`)
		// reads from this map during `readFile`/`exists`, which is how
		// `{% include %}` and the RenderPlugin shims resolve files at runtime.
		const allLiquidFiles = await findAllLiquidFiles(
			componentDirs,
			normalizedExtensions,
			normalizedIgnoreDirs,
		);

		for (const [i, filePath] of allLiquidFiles.entries()) {
			const id = `liquidFile_${i}`;
			source += `import ${id} from "./${filePath}";

      window.cc_liquid_files["${filePath}"] = ${id};
      `;
		}

		// Auto-mirror everything registered in the user's Eleventy config
		// (filters, shortcodes, paired shortcodes, tags) by importing the real
		// config and replaying it in the browser — closures and imports survive.
		// Built-in and override skip lists are passed in; see `emitConfigMirror`.
		const configPath = resolveEleventyConfigPath(liquidOptions);
		if (configPath) {
			source += emitConfigMirror(configPath, liquidOptions);
		} else {
			console.warn(
				"[editable-regions] Could not locate an Eleventy config file to " +
					"auto-mirror helpers from. Set `pluginOptions.liquid.configPath` " +
					"if your config isn't at a default location. Filters/shortcodes " +
					"defined in the config won't be available in live editing " +
					"(overrides still work).",
			);
		}

		// Register user-supplied browser-side overrides and pinned components
		// (filters, shortcodes, paired shortcodes, tags, components). Each
		// generates an `import` + the matching `register*` call. Override names
		// are excluded from the mirrored payload above, so there's no collision —
		// these are the sole registration for each name. Components aren't
		// replacing a mirrored registration; they take precedence over the
		// filesystem-resolution proxy that handles every other component name.
		source += emitImportRegistrations(liquidOptions);

		// Initialize the Proxy on window.cc_components for dynamic resolution
		source += `
      initComponentProxy();
    `;
	}
	return source;
}

/**
 * Builds the `process.env` subset to ship to the browser. Both inputs are
 * opt-in: with neither set, the result is empty.
 *
 * Empty-string prefixes are ignored — `"".startsWith("")` is true for every
 * env var, which would silently leak the entire host environment.
 *
 * @param {string[] | undefined} allowlist
 * @param {string | undefined} prefix
 */
function collectExposedEnv(allowlist, prefix) {
	/** @type {Record<string, string>} */
	const out = {};

	if (Array.isArray(allowlist)) {
		for (const name of allowlist) {
			if (typeof name !== "string") continue;

			const value = process.env[name];
			if (typeof value === "string") out[name] = value;
		}
	}

	if (typeof prefix === "string" && prefix.length > 0) {
		for (const [name, value] of Object.entries(process.env)) {
			if (name.startsWith(prefix) && typeof value === "string") {
				out[name] = value;
			}
		}
	}
	return out;
}

/**
 * Builds the static `eleventy` global that the bundle exposes in place of
 * Eleventy's build-time data of the same name. Mirrors the parts of
 * https://www.11ty.dev/docs/data-eleventy-supplied/ that make sense in a
 * browser, with deliberate omissions:
 *   - `env.config` and `env.root` are dropped (absolute filesystem paths
 *     don't belong in client JS).
 *   - `env.runMode` is hardcoded to `"serve"` — the dev-mode analogue, so
 *     templates branching on this take the right code path.
 *   - `env.source` is hardcoded to `"cli"`.
 *   - `serverless` is omitted (the plugin was removed from Eleventy core in 3.0).
 *
 * @param {EleventyDirectories} directories
 */
function buildEleventyData(directories) {
	const version = readEleventyVersion();

	return {
		version,
		generator: `Eleventy v${version}`,
		env: {
			runMode: "serve",
			source: "cli",
		},
		directories: {
			input: directories.input,
			includes: directories.includes,
			data: directories.data,
			output: directories.output,
		},
	};
}

/**
 * Reads the project `package.json` and returns the subset to expose as the
 * `pkg` global, mirroring 11ty's default. Strips the heavy fields that
 * dominate size and are essentially never read from templates
 * (`dependencies`, `devDependencies`, `peerDependencies`,
 * `optionalDependencies`, `scripts`); the runtime wrap
 * (`wrapPkgWithStripWarning`) warn-onces if a template reads one.
 *
 * Returns `null` on missing/malformed input so the bundle still builds;
 * `pkg` is simply absent from the engine globals in that case.
 */
function buildPkg() {
	try {
		const contents = fs.readFileSync(
			path.join(process.cwd(), "package.json"),
			"utf8",
		);
		const raw = JSON.parse(contents);

		const {
			dependencies: _dependencies,
			devDependencies: _devDependencies,
			peerDependencies: _peerDependencies,
			optionalDependencies: _optionalDependencies,
			scripts: _scripts,
			...rest
		} = raw;

		return rest;
	} catch {
		return null;
	}
}

/**
 * Reads the installed Eleventy version from its `package.json`. Returns
 * `"unknown"` if Eleventy can't be resolved so the bundle still builds.
 *
 * The `@11ty/eleventy` package doesn't export `./package.json` in its
 * `exports` field, so `require("@11ty/eleventy/package.json")` throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Instead we resolve the main entry (`.` is
 * always exported), then walk up the directory tree until we find the package
 * root.
 */
function readEleventyVersion() {
	try {
		const require = createRequire(import.meta.url);
		const entryPath = require.resolve("@11ty/eleventy");
		let dir = path.dirname(entryPath);
		while (true) {
			const pkgPath = path.join(dir, "package.json");
			if (fs.existsSync(pkgPath)) {
				/** @type {{name?: string, version?: string}} */
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
				if (pkg.name === "@11ty/eleventy" && pkg.version) return pkg.version;
			}
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		return "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Compacts 11ty's `eleventy.after` `results` array into the page-map shape
 * the browser runtime consumes: a plain object keyed by normalized input
 * path (leading `./` and `/` stripped, matching `normalizeInputPath` in
 * `liquid/page-map.mjs` and the CC API's path form).
 *
 * Pagination produces multiple entries with the same `inputPath` — we keep
 * the first. The page proxy and `inputPathToUrl` resolve _a_ canonical URL
 * for an input file; paginated cursor state is build-time-only and not
 * modelled in the editor.
 *
 * Returns `{}` if `results` is absent or malformed — callers treat that the
 * same as "the user opted out of the page map".
 *
 * @param {Array<{inputPath?: string, outputPath?: string, url?: string}> | undefined} results
 */
function buildPageMap(results) {
	if (!Array.isArray(results)) return {};

	/** @type {Record<string, { url?: string, outputPath?: string }>} */
	const map = {};

	for (const entry of results) {
		if (!entry || typeof entry.inputPath !== "string") continue;

		const key = entry.inputPath.replace(/^\.\//, "").replace(/^\/+/, "");
		if (!key || key in map) continue;

		map[key] = {
			url: typeof entry.url === "string" ? entry.url : undefined,
			outputPath:
				typeof entry.outputPath === "string" ? entry.outputPath : undefined,
		};
	}

	return map;
}

/**
 * @param {string[]} componentDirs
 * @param {string[]} extensions
 * @param {string[]} ignoreDirectories
 */
async function findAllLiquidFiles(
	componentDirs,
	extensions,
	ignoreDirectories,
) {
	const allFiles = [];

	for (const dir of componentDirs) {
		const files = await findFilesInDirectory({
			directory: dir,
			extensions,
			ignoreDirectories,
		});

		allFiles.push(...files);
	}

	return allFiles;
}

/**
 * @param {Object} options
 * @param {string} options.directory
 * @param {string[]} [options.extensions]
 * @param {string[]} [options.ignoreDirectories]
 * @returns {Promise<string[]>}
 */
async function findFilesInDirectory({
	directory,
	extensions = [".html", ".liquid"],
	ignoreDirectories = [],
}) {
	const files = [];

	try {
		const entries = await fs.promises.readdir(directory, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				if (ignoreDirectories.includes(entry.name.toLowerCase())) {
					continue;
				}

				const subFiles = await findFilesInDirectory({
					directory: fullPath,
					extensions,
					ignoreDirectories,
				});
				files.push(...subFiles);
			} else if (entry.isFile()) {
				// Handles both simple (.liquid) and compound (.bookshop.liquid) extensions
				const filenameLower = entry.name.toLowerCase();
				const hasValidExtension = extensions.some((ext) =>
					filenameLower.endsWith(ext),
				);
				if (hasValidExtension) {
					files.push(fullPath);
				}
			}
		}
	} catch (error) {
		console.error("ERROR reading directory:", directory, error);
		throw error;
	}

	return files;
}

/**
 * Maps each `pluginOptions.liquid` field that takes a `{ name: modulePath }`
 * map to the runtime registration function the emitted import compiles into.
 * `components` shares the same import-and-register shape: unlike the others it
 * doesn't replace an auto-mirrored registration, it pins a specific module
 * ahead of the filesystem-resolution proxy — but the emitted code is identical
 * in form, so it lives in the same table.
 */
const importRegisterFns = {
	filters: "registerFilter",
	shortcodes: "registerShortcode",
	pairedShortcodes: "registerPairedShortcode",
	tags: "registerCustomTag",
	components: "registerLiquidComponent",
};

/**
 * Emits an `import` + register-call pair for every `{ name: modulePath }`
 * entry across the `pluginOptions.liquid` maps in `importRegisterFns`. Each
 * entry produces, e.g.:
 *
 *   import filters_0 from "./path/to/file";
 *   registerFilter("name", filters_0);
 *
 * For filters/shortcodes/paired-shortcodes/tags these are browser overrides —
 * their names are skipped by the config mirror (`emitConfigMirror`) so the
 * override is the sole registration. For components they're user-pinned
 * module registrations.
 *
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string} JS source
 */
function emitImportRegistrations(liquidOptions) {
	let out = "";

	for (const optionKey of /** @type {Array<keyof typeof importRegisterFns>} */ (
		Object.keys(importRegisterFns)
	)) {
		const registerFn = importRegisterFns[optionKey];

		for (const [i, [name, file]] of Object.entries(
			liquidOptions?.[optionKey] ?? {},
		).entries()) {
			const id = `${optionKey}_${i}`;
			out += `\nimport ${id} from "./${file}";\n${registerFn}(${JSON.stringify(name)}, ${id});\n`;
		}
	}

	return out;
}
