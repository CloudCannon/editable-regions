import fs from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import esbuild from "esbuild";
import { createIncludeWithTag } from "../liquid/include-with-tag.mjs";

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
 * Payload Eleventy passes to `eleventy.after`. `directories` is the 3.x shape;
 * `dir` the older fallback still passed in 3.x.
 *
 * @typedef {Object} EleventyEventPayload
 * @property {EleventyDirectories} [directories]
 * @property {EleventyDirectories} [dir]
 * @property {Array<{inputPath?: string, outputPath?: string, url?: string}>} [results]
 */

/**
 * @typedef {(liquidEngine: import("liquidjs").Liquid) => { parse: (...args: any[]) => void, render: (...args: any[]) => unknown }} LiquidTagFactory
 */

/**
 * @typedef {"eleventy.before" | "eleventy.after" | "eleventy.beforeWatch" | "eleventy.beforeConfig"} EleventyEventName
 */

/**
 * The subset of Eleventy's (untyped) user config we touch.
 *
 * @typedef {Object} EleventyConfig
 * @property {(name: string, factory: LiquidTagFactory) => void} addLiquidTag
 * @property {(event: EleventyEventName, handler: (payload: EleventyEventPayload) => Promise<void> | void) => void} on
 * @property {EleventyDirectories} dir
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
		// 3.x `directories`, legacy `dir`, then a closure fallback.
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
			// The bundle imports the user's real Eleventy config (see
			// `emitConfigMirror`), dragging in Node/build-time imports — stub them.
			plugins: [createBrowserStubPlugin(liquidOptions.browserStub)],
			outfile: options.output ?? `${dirs.output}/register-components.js`,
		});
	});
}

/**
 * Liquid is enabled implicitly; only `liquid: false` opts out.
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
	};
}

/**
 * Resolves a per-language option: `false` → off, `true` → on with defaults,
 * object → on with those options, `undefined` → `defaultOn`.
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
 * Bare specifiers that must never reach the browser bundle: the 11ty toolchain
 * (and subpaths) and the Node plugin itself. NOT the `/browser` or `/liquid`
 * subpaths — those are the real browser runtime and bundle normally.
 */
const ALWAYS_STUBBED = [
	"@11ty/eleventy",
	"@cloudcannon/editable-regions/eleventy",
];

/**
 * esbuild plugin resolving Node built-ins and build-time-only packages to a
 * Proxy that survives `import` and property access but throws when called or
 * constructed — so the user's config bundles, and only a helper that actually
 * invokes a Node API at render time fails.
 *
 * @param {string[]} [extraStubs] - Extra specifiers to stub
 *   (`pluginOptions.liquid.browserStub`), e.g. native deps like `sharp`.
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
		if (id === "@11ty/eleventy" || id.startsWith("@11ty/eleventy/")) {
			return true;
		}
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
 * Resolves the user's Eleventy config path (11ty doesn't expose it): an
 * explicit `configPath`, else the first default config filename in the root.
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
 * in the browser to auto-mirror its helpers (see
 * `collectAndRegisterEleventyHelpers`). Passes the per-kind override names to
 * skip; those are registered separately by `emitImportRegistrations` so the
 * override wins.
 *
 * @param {string} configPath - Absolute path to the Eleventy config
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string} JS source
 */
function emitConfigMirror(configPath, liquidOptions) {
	const skip = {
		filters: Object.keys(liquidOptions?.filters ?? {}),
		shortcodes: Object.keys(liquidOptions?.shortcodes ?? {}),
		pairedShortcodes: Object.keys(liquidOptions?.pairedShortcodes ?? {}),
		tags: Object.keys(liquidOptions?.tags ?? {}),
	};

	return (
		`\nimport userEleventyConfig from ${JSON.stringify(configPath)};\n` +
		`collectAndRegisterEleventyHelpers(userEleventyConfig, ${JSON.stringify({ skip })});\n`
	);
}

/**
 * Builds the JS source for the live-editing client bundle: imports and
 * `register*` calls for components, filters, shortcodes, and tags.
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
		// `input` alongside `includes` so `{% include %}` reaches sibling files.
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
      import { createSharedLiquidEngine, registerLiquidComponent, registerFilter, registerShortcode, registerPairedShortcode, registerCustomTag, registerGlobals, registerEleventyData, registerPkg, registerPageMap, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';
      import { registerEleventyBuiltins, collectAndRegisterEleventyHelpers } from '@cloudcannon/editable-regions/eleventy/browser';

      setVerbose(${Boolean(options.verbose)});

			const liquidEngine = createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

			// Wires on Eleventy's built-in filters/shortcodes (browser ports)
			// and RenderPlugin shims onto the host-agnostic engine.
			registerEleventyBuiltins(liquidEngine);

    	window.cc_liquid_files = {};
  `;

		// User-supplied globals, embedded as a literal so editor-rendered
		// templates read the same values the build exposes.
		if (options.globals && Object.keys(options.globals).length > 0) {
			source += `\nregisterGlobals(${JSON.stringify(options.globals)});\n`;
		}

		// Static `eleventy` global so templates branching on `eleventy.version` /
		// `eleventy.env.runMode` see something sensible.
		const eleventyData = buildEleventyData(directories);
		source += `\nregisterEleventyData(${JSON.stringify(eleventyData)});\n`;

		// 11ty exposes the project's package.json as the `pkg` global by default.
		const pkg = buildPkg();
		if (pkg) {
			source += `\nregisterPkg(${JSON.stringify(pkg)});\n`;
		}

		// Build-time page map from 11ty's `results`, so the page/collections
		// proxies and `inputPathToUrl` resolve computed/templated permalinks.
		const pageMap = buildPageMap(results);
		if (Object.keys(pageMap).length > 0) {
			source += `\nregisterPageMap(${JSON.stringify(pageMap)});\n`;
		}

		// Pre-populate `window.cc_liquid_files` with every includable template,
		// the map LiquidJS's in-memory fs (`liquid/fs.mjs`) resolves against.
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

		// Auto-mirror the user's config helpers by importing and replaying the
		// real config in the browser. See `emitConfigMirror`.
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

		// Register browser-side overrides and pinned components. Override names
		// are excluded from the mirror, so each is its name's sole registration.
		source += emitImportRegistrations(liquidOptions);

		source += `
      initComponentProxy();
    `;
	}
	return source;
}

/**
 * Builds the static `eleventy` global, mirroring the browser-applicable parts
 * of https://www.11ty.dev/docs/data-eleventy-supplied/. `env.config`/`env.root`
 * (absolute paths) and `serverless` are omitted; `env.runMode`/`env.source` are
 * hardcoded to `"serve"`/`"cli"` so branching templates take a sane path.
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
 * Reads the project `package.json` for the `pkg` global. Returns `null` on
 * missing/malformed input so the bundle still builds.
 */
function buildPkg() {
	try {
		const contents = fs.readFileSync(
			path.join(process.cwd(), "package.json"),
			"utf8",
		);
		return JSON.parse(contents);
	} catch {
		return null;
	}
}

/**
 * Reads the installed Eleventy version, or `"unknown"` if unresolvable.
 * `@11ty/eleventy` doesn't export `./package.json`, so we resolve its main
 * entry and walk up to the package root instead.
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
 * Compacts 11ty's `results` into the page map, keyed by normalized input path
 * (matching `normalizeInputPath` in `liquid/page-map.mjs`). Pagination yields
 * duplicate `inputPath`s — we keep the first, since cursors aren't modelled in
 * the editor. Returns `{}` if `results` is absent or malformed.
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
				// Handles compound extensions too (e.g. `.bookshop.liquid`).
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
 * Maps each `{ name: modulePath }` `pluginOptions.liquid` field to its runtime
 * registration function. `components` pins a module ahead of the
 * filesystem-resolution proxy via the same import-and-register shape.
 */
const IMPORT_REGISTER_FNS = {
	filters: "registerFilter",
	shortcodes: "registerShortcode",
	pairedShortcodes: "registerPairedShortcode",
	tags: "registerCustomTag",
	components: "registerLiquidComponent",
};

/**
 * Emits an `import` + register-call pair for every `{ name: modulePath }` entry
 * across the `IMPORT_REGISTER_FNS` maps, e.g.:
 *
 *   import filters_0 from "./path/to/file";
 *   registerFilter("name", filters_0);
 *
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string} JS source
 */
function emitImportRegistrations(liquidOptions) {
	let out = "";

	for (const optionKey of /** @type {Array<keyof typeof IMPORT_REGISTER_FNS>} */ (
		Object.keys(IMPORT_REGISTER_FNS)
	)) {
		const registerFn = IMPORT_REGISTER_FNS[optionKey];

		for (const [i, [name, file]] of Object.entries(
			liquidOptions?.[optionKey] ?? {},
		).entries()) {
			const id = `${optionKey}_${i}`;
			out += `\nimport ${id} from "./${file}";\n${registerFn}(${JSON.stringify(name)}, ${id});\n`;
		}
	}

	return out;
}
