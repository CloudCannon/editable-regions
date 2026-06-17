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
 * Eleventy lifecycle event names. We only subscribe to `eleventy.after`.
 *
 * @typedef {"eleventy.before" | "eleventy.after" | "eleventy.beforeWatch" | "eleventy.beforeConfig"} EleventyEventName
 */

/**
 * The subset of Eleventy's user config object we touch. Eleventy ships no
 * types, so we declare only what we use.
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
		// `directories` is the 11ty 3.x shape; `dir` the legacy one (still
		// passed in 3.x); `eleventyConfig.dir` a last-resort closure fallback.
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
			// `emitConfigMirror`), which drags in Node/build-time imports. Stub
			// them so the `import`s resolve but throw if actually called.
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
		// Future opt-in languages follow the same shape but default to off,
		// e.g. `normalizeLanguageOption(opts.nunjucks, { defaultOn: false })`.
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
 * when *called* or *constructed*. This lets the user's Eleventy config bundle
 * for the browser; only a helper that actually invokes a Node API at render
 * time fails (which it must — it can't run in a browser).
 *
 * @param {string[]} [extraStubs] - Additional bare specifiers to stub, from
 *   `pluginOptions.liquid.browserStub` (for native deps like `sharp` that a
 *   config imports but no browser-bound helper calls).
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
		// `@11ty/eleventy` and any subpath (but not the editable-regions
		// `/browser` + `/liquid` subpaths, which are real browser code).
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
 * bundle can import it. 11ty doesn't expose it on the `eleventyConfig` object,
 * so we resolve it ourselves: an explicit `pluginOptions.liquid.configPath`,
 * else the first of 11ty's default config filenames present in the project root.
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
 * (see `collectAndRegisterEleventyHelpers`). Importing the real config keeps
 * each helper's closures and imports intact.
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
		// page template can reach sibling files in the input tree.
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

			const liquidEngine = createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

			// The engine is host-agnostic; this wires on Eleventy's built-in
			// filters/shortcodes (browser ports) + RenderPlugin shims.
			registerEleventyBuiltins(liquidEngine);

    	window.cc_liquid_files = {};
  `;

		// Build the filtered env object in Node and embed it as a static literal —
		// the browser never sees the host `process.env`, only the allowlisted keys.
		const exposedEnv = collectExposedEnv(options.env, options.envPrefix);
		if (Object.keys(exposedEnv).length > 0) {
			source += `\nregisterProcessEnv(${JSON.stringify(exposedEnv)});\n`;
		}

		// Static `eleventy` global, embedded as a literal so templates branching
		// on `eleventy.version` / `eleventy.env.runMode` see something sensible.
		const eleventyData = buildEleventyData(directories);
		source += `\nregisterEleventyData(${JSON.stringify(eleventyData)});\n`;

		// 11ty exposes the project's package.json as the `pkg` global by
		// default. We mirror that, minus the heavy fields (see `buildPkg`).
		const pkg = buildPkg();
		if (pkg) {
			source += `\nregisterPkg(${JSON.stringify(pkg)});\n`;
		}

		// Build-time page map (inputPath -> { url, outputPath }) from 11ty's
		// `results` payload, so the page / collections proxies and
		// `inputPathToUrl` resolve permalinks computed by JS config or
		// `eleventyComputed`. Opt out via `liquid.pageMap: false`.
		if (liquidOptions.pageMap !== false) {
			const pageMap = buildPageMap(results);
			if (Object.keys(pageMap).length > 0) {
				source += `\nregisterPageMap(${JSON.stringify(pageMap)});\n`;
			}
		}

		// Walk every liquid file under the component dirs (anything
		// `{% include %}`-able) and pre-populate `window.cc_liquid_files`, the
		// map LiquidJS's in-memory filesystem (`integrations/liquid/fs.mjs`)
		// reads from to resolve `{% include %}` and the RenderPlugin shims.
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

		// Register user-supplied browser-side overrides and pinned components.
		// Override names are excluded from the mirror above, so each is the sole
		// registration for its name. Pinned components take precedence over the
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
 * Builds the static `eleventy` global the bundle exposes in place of
 * Eleventy's build-time data. Mirrors the browser-applicable parts of
 * https://www.11ty.dev/docs/data-eleventy-supplied/, with deliberate omissions:
 *   - `env.config` / `env.root` dropped (absolute filesystem paths).
 *   - `env.runMode` hardcoded to `"serve"` (the dev-mode analogue) and
 *     `env.source` to `"cli"`, so templates branching on them take a sane path.
 *   - `serverless` omitted (removed from Eleventy core in 3.0).
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
 * `pkg` global, mirroring 11ty's default. Strips the heavy fields rarely read
 * from templates (`dependencies`, `devDependencies`, `peerDependencies`,
 * `optionalDependencies`, `scripts`); the runtime wrap
 * (`wrapPkgWithStripWarning`) warn-onces if a template reads one.
 *
 * Returns `null` on missing/malformed input so the bundle still builds.
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
 * `@11ty/eleventy` doesn't export `./package.json`, so requiring it directly
 * throws ERR_PACKAGE_PATH_NOT_EXPORTED. We resolve the main entry instead,
 * then walk up to the package root.
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
 * Compacts 11ty's `results` array into the page-map shape the browser runtime
 * consumes: an object keyed by normalized input path (matching
 * `normalizeInputPath` in `liquid/page-map.mjs` and the CC API's path form).
 *
 * Pagination produces multiple entries with the same `inputPath` — we keep the
 * first, since paginated cursor state isn't modelled in the editor.
 *
 * Returns `{}` if `results` is absent or malformed.
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
 * map to its runtime registration function. `components` shares the same
 * import-and-register shape (it pins a module ahead of the filesystem-
 * resolution proxy rather than replacing a mirrored registration).
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
 * entry across the `pluginOptions.liquid` maps in `importRegisterFns`, e.g.:
 *
 *   import filters_0 from "./path/to/file";
 *   registerFilter("name", filters_0);
 *
 * Override names are skipped by the config mirror so each is the sole
 * registration; `components` entries are user-pinned modules.
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
