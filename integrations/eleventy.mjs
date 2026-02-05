import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { evalToken, Tokenizer, toPromise } from "liquidjs";
import slugify from "slugify";
import { createBindIncludeTag } from "./liquid/index.mjs";

/**
 * @typedef {Object} ComponentRegistration
 * @property {string} name - Component name
 * @property {string} file - Path to component file
 */

/**
 * @typedef {Object} LiquidOptions
 * @property {string | string[]} [component_dirs] - Defaults to ["src/_includes/"]
 * @property {string | string[]} [extensions] - Defaults to [".liquid", ".html"]
 * @property {string[]} [ignore_directories] - Directory names to skip (e.g., ["_drafts", "node_modules"])
 * @property {ComponentRegistration[]} [components] - Registered components
 * @property {ComponentRegistration[]} [filters] - Custom Liquid filters
 * @property {ComponentRegistration[]} [shortcodes] - Custom shortcodes
 * @property {ComponentRegistration[]} [paired_shortcodes] - Custom paired shortcodes
 * @property {ComponentRegistration[]} [custom_tags] - Custom tags
 */

/**
 * @typedef {Object} PluginOptions
 * @property {string} [output] - Output path for live-editing.js
 * @property {boolean} [verbose] - Enable verbose browser logging
 * @property {LiquidOptions} [liquid] - Liquid template options
 * @property {Object} [nunjucks] - Nunjucks options (reserved for future use)
 */

/**
 * @typedef {Object} EleventyConfig
 * @property {function(string, function): void} addLiquidTag - Register a custom Liquid tag
 * @property {function(string, function): void} on - Register an event handler
 * @property {{ output: string, input: string, includes: string, data: string }} dir - Directory configuration
 */

/**
 * Normalize a value to an array.
 *
 * @param {string | string[] | undefined} value - Value to normalize
 * @param {string[]} defaultValue - Default array if value is falsy
 * @returns {string[]} Normalized array
 */
function normalizeToArray(value, defaultValue) {
	if (!value) return defaultValue;
	return Array.isArray(value) ? value : [value];
}

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
		const bindIncludeTag = createBindIncludeTag({
			Tokenizer,
			evalToken,
			toPromise,
		});
		eleventyConfig.addLiquidTag("bind_include", bindIncludeTag);
	}

	eleventyConfig.on("eleventy.before", async () => {
		const liveEditingSource = createLiveEditingSource(pluginOptions);

		// Build dynamic loader config from extensions
		// esbuild only looks at the final extension, so .bookshop.liquid -> .liquid
		const extensions = normalizeToArray(pluginOptions.liquid?.extensions, [
			".liquid",
			".html",
		]);
		const finalExtensions = [
			...new Set(
				extensions.map((ext) => {
					const normalized = ext.startsWith(".") ? ext : `.${ext}`;
					// Extract the final extension (e.g., ".bookshop.liquid" -> ".liquid")
					const lastDotIndex = normalized.lastIndexOf(".");
					return normalized.slice(lastDotIndex);
				}),
			),
		];
		/** @type {Record<string, import('esbuild').Loader>} */
		const loader = Object.fromEntries(
			finalExtensions.map((ext) => [ext, /** @type {const} */ ("text")]),
		);

		await esbuild.build({
			stdin: {
				contents: await liveEditingSource,
				resolveDir: process.cwd(),
			},
			loader,
			bundle: true,
			outfile:
				pluginOptions.output ?? `${eleventyConfig.dir.output}/live-editing.js`,
		});
	});
}

/**
 * Creates the JavaScript source code for the live-editing client bundle.
 * Generates imports for components, filters, shortcodes, and tags.
 *
 * @param {PluginOptions} pluginOptions - Plugin configuration options
 * @returns {Promise<string>} Generated JavaScript source code
 */
const createLiveEditingSource = async (pluginOptions) => {
	let source = "";

	if (pluginOptions.liquid) {
		const componentDirs = normalizeToArray(
			pluginOptions.liquid.component_dirs,
			["src/_includes/"],
		);
		const extensions = normalizeToArray(pluginOptions.liquid.extensions, [
			".liquid",
			".html",
		]);

		source += `		
      import { registerLiquidComponent, registerCustomFilter, registerCustomShortcode, registerCustomPairedShortcode, registerCustomTag, setVerbose, configureLiquid } from '@cloudcannon/editable-regions/liquid';

      setVerbose(${Boolean(pluginOptions.verbose)});
      
      // Configure the Liquid engine with component directories
      configureLiquid({
        componentDirs: ${JSON.stringify(componentDirs)}
      });
      
      window.cc_files = {};
    `;

		// Add files we'll need to window.cc_files -
		// Then in our liquid file system we can grab them from window.cc_files during readFile
		// Important for nested components
		let i = 0;
		const allLiquidFiles = await findAllLiquidFiles({
			component_dirs: componentDirs,
			extensions: extensions,
			ignoreDirectories: pluginOptions.liquid.ignore_directories || [],
		});
		allLiquidFiles?.forEach((path) => {
			const id = `liquid_file_${i++}`;
			source += `import ${id} from "./${path}";

      window.cc_files["${path}"] = ${id};
      `;
		});

		// Register custom filters
		const customFilters = pluginOptions.liquid?.filters;
		if (customFilters?.length) {
			for (const { name, file } of customFilters) {
				const slugifiedFilterName = `${slugify(name, {
					replacement: "_",
					strict: true,
				})}_filter`;
				source += `  
          import ${slugifiedFilterName} from "./${file}";
          registerCustomFilter("${name}", ${slugifiedFilterName});
        `;
			}
		}

		// Register custom shortcodes
		const customShortcodes = pluginOptions.liquid?.shortcodes;
		if (customShortcodes?.length) {
			for (const { name, file } of customShortcodes) {
				const slugifiedShortcodeName = `${slugify(name, {
					replacement: "_",
					strict: true,
				})}_shortcode`;
				source += `  
          import ${slugifiedShortcodeName} from "./${file}";
          registerCustomShortcode("${name}", ${slugifiedShortcodeName});
        `;
			}
		}

		// Register custom paired shortcodes
		const customPairedShortcodes = pluginOptions.liquid?.paired_shortcodes;
		if (customPairedShortcodes?.length) {
			for (const { name, file } of customPairedShortcodes) {
				const slugifiedShortcodeName = `${slugify(name, {
					replacement: "_",
					strict: true,
				})}_paired_shortcode`;
				source += `  
          import ${slugifiedShortcodeName} from "./${file}";
          registerCustomPairedShortcode("${name}", ${slugifiedShortcodeName});
        `;
			}
		}

		// Register custom tags
		const customTags = pluginOptions.liquid?.custom_tags;
		if (customTags?.length) {
			for (const { name, file } of customTags) {
				const slugifiedTagName = `${slugify(name, {
					replacement: "_",
					strict: true,
				})}_custom_tag`;
				source += `  
          import ${slugifiedTagName} from "./${file}";
          registerCustomTag("${name}", ${slugifiedTagName});
        `;
			}
		}

		// Register components
		pluginOptions.liquid?.components?.forEach(({ name, file }) => {
			const slugifiedComponentName = slugify(name, {
				replacement: "_",
				strict: true,
			});

			source += `
        import ${slugifiedComponentName} from "./${file}";
        registerLiquidComponent("${name}", ${slugifiedComponentName});
      `;
		});
	}
	return source.toString();
};

/**
 * Find all component files across multiple directories.
 *
 * @param {Object} options - Search options
 * @param {string[]} [options.component_dirs] - Directories to search
 * @param {string[]} [options.extensions] - File extensions to match
 * @param {string[]} [options.ignoreDirectories] - Directory names to skip
 * @returns {Promise<string[]>} Array of file paths
 */
async function findAllLiquidFiles({
	component_dirs = ["src/_includes/"],
	extensions = [".liquid", ".html"],
	ignoreDirectories = [],
}) {
	const allFiles = [];

	for (const dir of component_dirs) {
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
	extensions = [".liquid", ".html"],
	ignoreDirectories = [],
}) {
	const files = [];
	// Normalize extensions to lowercase with leading dot
	const normalizedExtensions = extensions.map((ext) =>
		ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
	);
	const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
		dir.toLowerCase(),
	);

	try {
		const entries = await fs.promises.readdir(directory, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				if (normalizedIgnoreDirs.includes(entry.name.toLowerCase())) {
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
				const hasValidExtension = normalizedExtensions.some((ext) =>
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
