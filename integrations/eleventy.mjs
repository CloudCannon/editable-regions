import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { tier1FilterNames } from "./liquid/11ty-filters.mjs";
import { createIncludeWithTag } from "./liquid/index.mjs";

/**
 * @typedef {Object} LiquidOptions
 * @property {string[]} [componentDirs] - Defaults to Eleventy's configured directories.includes
 * @property {string[]} [extensions] - Defaults to [".liquid", ".html"]
 * @property {string[]} [ignoreDirectories] - Directory names to skip (e.g., ["_drafts", "node_modules"])
 * @property {Record<string, string>} [componentOverrides] - Explicitly registered components that override dynamic resolution
 * @property {Record<string, string>} [filters] - Browser-side filter overrides, keyed by filter name with a path to a module exporting the replacement function. Filters registered in `eleventy.config.mjs` are auto-mirrored into the bundle by default; use this only when a filter can't be serialized to the browser (e.g. it touches `this.ctx`, `process`, `require`, `__dirname`) and you need to supply a browser-friendly implementation.
 * @property {Record<string, string>} [shortcodes] - Custom shortcodes
 * @property {Record<string, string>} [pairedShortcodes] - Custom paired shortcodes
 * @property {Record<string, string>} [tags] - Custom tags
 */

/**
 * @typedef {Object} PluginOptions
 * @property {string} [output] - Output path for live-editing.js
 * @property {boolean} [verbose] - Enable verbose browser logging
 * @property {LiquidOptions} [liquid] - Liquid template options
 */

/**
 * @typedef {Object} EleventyDirectories
 * @property {string} input - Input directory
 * @property {string} includes - Includes directory (normalized, relative to project root)
 * @property {string} data - Data directory
 * @property {string} output - Output directory
 */

/**
 * @typedef {Object} EleventyEventPayload
 * @property {EleventyDirectories} [directories]
 * @property {EleventyDirectories} [dir]
 */

/**
 * @typedef {Object} EleventyConfig
 * @property {function(string, function): void} addLiquidTag - Register a custom Liquid tag
 * @property {function(string, function(any): any): void} addCollection - Register a collection builder
 * @property {function(string, function(EleventyEventPayload): Promise<void> | void): void} on - Register an event handler
 * @property {EleventyDirectories} dir - Directory configuration
 */

/**
 * Eleventy plugin for CloudCannon editable regions.
 * Registers Liquid tags and builds live-editing client bundle.
 *
 * @param {EleventyConfig} eleventyConfig - Eleventy configuration object
 * @param {PluginOptions} pluginOptions - Plugin configuration options
 * @returns {void}
 */
export default function (eleventyConfig, pluginOptions) {
	if (pluginOptions.liquid) {
		eleventyConfig.addLiquidTag("include_with", createIncludeWithTag);
	}

	eleventyConfig.on("eleventy.after", async ({ directories, dir }) => {
		const dirs = directories ?? dir ?? eleventyConfig.dir;
		const liveEditingSource = await createLiveEditingSource(
			pluginOptions,
			dirs,
			eleventyConfig,
		);

		// Build dynamic loader config from extensions
		// esbuild only looks at the final extension, so .bookshop.liquid -> .liquid
		/** @type {Record<string, import('esbuild').Loader>} */
		const loader = {};
		const extensions = pluginOptions.liquid?.extensions ?? [".liquid", ".html"];
		extensions.forEach((ext) => {
			const normalized = ext.startsWith(".") ? ext : `.${ext}`;
			const lastDotIndex = normalized.lastIndexOf(".");
			loader[normalized.slice(lastDotIndex)] = "text";
		});

		await esbuild.build({
			stdin: {
				contents: liveEditingSource,
				resolveDir: process.cwd(),
			},
			loader,
			bundle: true,
			outfile: pluginOptions.output ?? `${dirs.output}/live-editing.js`,
		});
	});
}

/**
 * Reads all filters Eleventy has registered and emits a
 * `registerMirroredFilters({...})` call for the bundle (Tier 2 in the
 * three-tier filter resolution).
 *
 * For each filter not in `skipNames`, attempts to serialize the function via
 * `fn.toString()`. A quick heuristic flags sources that reference closure
 * state or Node-only APIs; those get a pass-through stub that warns once.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {string[]} skipNames - Filter names to omit (Tier 1 + Tier 3)
 * @returns {string} JS source to append to the bundle
 */
function serializeMirroredFilters(eleventyConfig, skipNames) {
	// Pull from both universal (cross-engine) and liquid-specific registries.
	// Liquid-specific wins on name collisions (more specific registration).
	/** @type {any} */
	const cfg = eleventyConfig;
	const universal = cfg?.universal?.filters ?? {};
	const liquidSpecific = cfg?.liquid?.filters ?? {};
	/** @type {Record<string, any>} */
	const merged = { ...universal, ...liquidSpecific };

	const skip = new Set(skipNames);
	const entries = [];

	for (const [name, fn] of Object.entries(merged)) {
		if (skip.has(name)) continue;
		if (typeof fn !== "function") continue;

		// Eleventy wraps every registered filter in a benchmark closure
		// (see @11ty/eleventy/src/Benchmark/BenchmarkGroup.js), which references
		// local `callback`/`benchmark` identifiers that don't exist in the
		// browser. The original user function is hung off the wrapper via
		// `__eleventyInternal.callback` — use that for serialization.
		const original = fn.__eleventyInternal?.callback ?? fn;
		if (typeof original !== "function") continue;

		const source = original.toString();
		const classification = classifyFilterSource(source);

		const nameLit = JSON.stringify(name);
		if (classification.portable) {
			// Wrap in parens so `function name(...) {}` or `async function(){}`
			// parses as an expression in an object literal.
			entries.push(`  ${nameLit}: (${source})`);
		} else {
			entries.push(
				`  ${nameLit}: ${buildStubSource(name, classification.reason)}`,
			);
		}
	}

	if (entries.length === 0) return "";

	return `\nregisterMirroredFilters({\n${entries.join(",\n")}\n});\n`;
}

/**
 * Heuristic check for whether a stringified filter can be safely shipped to
 * the browser. Returns `{portable: true}` when the source is self-contained
 * or `{portable: false, reason}` when it references things we can't recreate.
 *
 * @param {string} source
 * @returns {{portable: true} | {portable: false, reason: string}}
 */
function classifyFilterSource(source) {
	const patterns = [
		{
			re: /this\.(ctx|page|eleventy|config)\b/,
			reason:
				"it references Eleventy's filter `this` context (this.ctx/this.page/this.eleventy/this.config)",
		},
		{ re: /\brequire\s*\(/, reason: "it calls require() at runtime" },
		{ re: /\bimport\s*\(/, reason: "it uses dynamic import()" },
		{ re: /\bprocess\./, reason: "it reads from Node's process global" },
		{
			re: /\b__(dirname|filename)\b/,
			reason: "it references __dirname or __filename",
		},
	];
	for (const { re, reason } of patterns) {
		if (re.test(source)) return { portable: false, reason };
	}
	return { portable: true };
}

/**
 * Builds a self-contained pass-through filter that warns once on first
 * invocation. Emitted inline so there's no module-level dependency.
 *
 * @param {string} name
 * @param {string} reason
 * @returns {string}
 */
function buildStubSource(name, reason) {
	const message = JSON.stringify(
		`Eleventy filter "${name}" is not supported in live editing (${reason}). Returning the input unchanged.`,
	);
	return `(() => {
    let warned = false;
    return (value) => {
      if (!warned) { warned = true; console.warn(${message}); }
      return value;
    };
  })()`;
}

/**
 * Creates the JavaScript source code for the live-editing client bundle.
 * Generates imports for components, filters, shortcodes, and tags.
 *
 * @param {PluginOptions} pluginOptions - Plugin configuration options
 * @param {EleventyDirectories} directories - Eleventy directory configuration
 * @param {EleventyConfig} eleventyConfig - Eleventy config, used to read registered filters
 * @returns {Promise<string>} Generated JavaScript source code
 */
const createLiveEditingSource = async (
	pluginOptions,
	directories,
	eleventyConfig,
) => {
	let source = "";

	if (pluginOptions.liquid) {
		const componentDirs = pluginOptions.liquid.componentDirs ?? [
			directories.includes,
			directories.input,
		];
		const extensions = pluginOptions.liquid.extensions ?? [".liquid", ".html"];
		const ignoreDirectories = pluginOptions.liquid.ignoreDirectories ?? [
			directories.output,
			"node_modules",
		];

		const normalizedExtensions = extensions.map((ext) =>
			ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
		);
		const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
			dir.toLowerCase(),
		);

		source += `
      import { createSharedLiquidEngine, registerLiquidComponent, registerCustomFilter, registerCustomShortcode, registerCustomPairedShortcode, registerCustomTag, registerMirroredFilters, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';

      setVerbose(${Boolean(pluginOptions.verbose)});

			// Configure the Liquid engine with component directories
			createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

    	window.cc_files = {};
  `;

		// Add files we'll need to window.cc_files -
		// Then in our liquid file system we can grab them from window.cc_files during readFile
		let i = 0;
		const allLiquidFiles = await findAllLiquidFiles(
			componentDirs,
			normalizedExtensions,
			normalizedIgnoreDirs,
		);
		allLiquidFiles.forEach((path) => {
			const id = `liquidFile_${i++}`;
			source += `import ${id} from "./${path}";

      window.cc_files["${path}"] = ${id};
      `;
		});

		// Tier 2: auto-mirror any filter Eleventy has registered that we don't
		// already cover with a handwritten browser port (Tier 1) or a user
		// override (Tier 3). Emitted before Tier 3 so user overrides win.
		const tier3Names = Object.keys(pluginOptions.liquid?.filters ?? {});
		source += serializeMirroredFilters(eleventyConfig, [
			...tier1FilterNames,
			...tier3Names,
		]);

		// Register custom filters
		const customFilters = pluginOptions.liquid?.filters;
		if (customFilters) {
			let filterIdx = 0;
			for (const [name, file] of Object.entries(customFilters)) {
				const filterName = `customFilter_${filterIdx++}`;
				source += `  
          import ${filterName} from "./${file}";
          registerCustomFilter("${name}", ${filterName});
        `;
			}
		}

		// Register custom shortcodes
		const customShortcodes = pluginOptions.liquid?.shortcodes;
		if (customShortcodes) {
			let shortcodeIdx = 0;
			for (const [name, file] of Object.entries(customShortcodes)) {
				const shortcodeName = `customShortcode_${shortcodeIdx++}`;
				source += `  
          import ${shortcodeName} from "./${file}";
          registerCustomShortcode("${name}", ${shortcodeName});
        `;
			}
		}

		// Register custom paired shortcodes
		const customPairedShortcodes = pluginOptions.liquid?.pairedShortcodes;
		if (customPairedShortcodes) {
			let pairedIdx = 0;
			for (const [name, file] of Object.entries(customPairedShortcodes)) {
				const pairedShortcodeName = `customPairedShortcode_${pairedIdx++}`;
				source += `  
          import ${pairedShortcodeName} from "./${file}";
          registerCustomPairedShortcode("${name}", ${pairedShortcodeName});
        `;
			}
		}

		// Register custom tags
		const tags = pluginOptions.liquid?.tags;
		if (tags) {
			let tagIdx = 0;
			for (const [name, file] of Object.entries(tags)) {
				const tagName = `tag_${tagIdx++}`;
				source += `  
          import ${tagName} from "./${file}";
          registerCustomTag("${name}", ${tagName});
        `;
			}
		}

		// Register explicit component overrides
		const componentOverrides = pluginOptions.liquid?.componentOverrides;
		if (componentOverrides) {
			let componentIdx = 0;
			for (const [name, file] of Object.entries(componentOverrides)) {
				const componentName = `customComponent_${componentIdx++}`;
				source += `
        import ${componentName} from "./${file}";
        registerLiquidComponent("${name}", ${componentName});
      `;
			}
		}

		// Initialize the Proxy on window.cc_components for dynamic resolution
		source += `
      initComponentProxy();
    `;
	}
	return source;
};

/**
 * Find all component files across multiple directories.
 *
 * @param {string[]} componentDirs - Directories to search
 * @param {string[]} extensions - File extensions to match
 * @param {string[]} ignoreDirectories - Directory names to skip
 * @returns {Promise<string[]>} Array of file paths
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
 * Recursively find all matching files in a single directory.
 *
 * @param {Object} options - Search options
 * @param {string} options.directory - Directory to search
 * @param {string[]} [options.extensions] - File extensions to match
 * @param {string[]} [options.ignoreDirectories] - Directory names to skip
 * @returns {Promise<string[]>} Array of file paths
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
				// Check if filename ends with any of the configured extensions
				// This handles both simple (.liquid) and compound (.bookshop.liquid) extensions
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
