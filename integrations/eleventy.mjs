import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { createBindIncludeTag } from "./liquid/index.mjs";

/**
 * @typedef {Object} ComponentRegistration
 * @property {string} name - Component name
 * @property {string} file - Path to component file
 */

/**
 * @typedef {Object} LiquidOptions
 * @property {string[]} [componentDirs] - Defaults to Eleventy's configured directories.includes
 * @property {string[]} [extensions] - Defaults to [".liquid", ".html"]
 * @property {string[]} [ignoreDirectories] - Directory names to skip (e.g., ["_drafts", "node_modules"])
 * @property {ComponentRegistration[]} [components] - Registered components
 * @property {ComponentRegistration[]} [filters] - Custom Liquid filters
 * @property {ComponentRegistration[]} [shortcodes] - Custom shortcodes
 * @property {ComponentRegistration[]} [pairedShortcodes] - Custom paired shortcodes
 * @property {ComponentRegistration[]} [tags] - Custom tags
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
 * @typedef {Object} EleventyConfig
 * @property {function(string, function): void} addLiquidTag - Register a custom Liquid tag
 * @property {function(string, function({ directories: EleventyDirectories }): Promise<void>): void} on - Register an event handler
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
		eleventyConfig.addLiquidTag("bind_include", createBindIncludeTag);
	}

	eleventyConfig.on("eleventy.before", async ({ directories }) => {
		const liveEditingSource = createLiveEditingSource(
			pluginOptions,
			directories,
		);

		// Build dynamic loader config from extensions
		// esbuild only looks at the final extension, so .bookshop.liquid -> .liquid
		/** @type {Record<string, import('esbuild').Loader>} */
		const loader = {};
		const extensions = pluginOptions.liquid?.extensions ?? [".liquid", ".html"];
		extensions.forEach((ext) => {
			const normalized = ext.startsWith(".") ? ext : `.${ext}`;
			// Extract the final extension (e.g., ".bookshop.liquid" -> ".liquid")
			const lastDotIndex = normalized.lastIndexOf(".");
			loader[normalized.slice(lastDotIndex)] = "text";
		});

		await esbuild.build({
			stdin: {
				contents: await liveEditingSource,
				resolveDir: process.cwd(),
			},
			loader,
			bundle: true,
			outfile: pluginOptions.output ?? `${directories.output}/live-editing.js`,
		});
	});
}

/**
 * Creates the JavaScript source code for the live-editing client bundle.
 * Generates imports for components, filters, shortcodes, and tags.
 *
 * @param {PluginOptions} pluginOptions - Plugin configuration options
 * @param {EleventyDirectories} directories - Eleventy directory configuration
 * @returns {Promise<string>} Generated JavaScript source code
 */
const createLiveEditingSource = async (pluginOptions, directories) => {
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
      import { createSharedLiquidEngine, registerLiquidComponent, registerCustomFilter, registerCustomShortcode, registerCustomPairedShortcode, registerCustomTag, setVerbose } from '@cloudcannon/editable-regions/liquid';

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

		// Register custom filters
		const customFilters = pluginOptions.liquid?.filters;
		if (customFilters?.length) {
			let filterIdx = 0;
			for (const { name, file } of customFilters) {
				const filterName = `customFilter_${filterIdx++}`;
				source += `  
          import ${filterName} from "./${file}";
          registerCustomFilter("${name}", ${filterName});
        `;
			}
		}

		// Register custom shortcodes
		const customShortcodes = pluginOptions.liquid?.shortcodes;
		if (customShortcodes?.length) {
			let shortcodeIdx = 0;
			for (const { name, file } of customShortcodes) {
				const shortcodeName = `customShortcode_${shortcodeIdx++}`;
				source += `  
          import ${shortcodeName} from "./${file}";
          registerCustomShortcode("${name}", ${shortcodeName});
        `;
			}
		}

		// Register custom paired shortcodes
		const customPairedShortcodes = pluginOptions.liquid?.pairedShortcodes;
		if (customPairedShortcodes?.length) {
			let pairedIdx = 0;
			for (const { name, file } of customPairedShortcodes) {
				const pairedShortcodeName = `customPairedShortcode_${pairedIdx++}`;
				source += `  
          import ${pairedShortcodeName} from "./${file}";
          registerCustomPairedShortcode("${name}", ${pairedShortcodeName});
        `;
			}
		}

		// Register custom tags
		const tags = pluginOptions.liquid?.tags;
		if (tags?.length) {
			let tagIdx = 0;
			for (const { name, file } of tags) {
				const tagName = `tag_${tagIdx++}`;
				source += `  
          import ${tagName} from "./${file}";
          registerCustomTag("${name}", ${tagName});
        `;
			}
		}

		// Register components
		let componentIdx = 0;
		pluginOptions.liquid?.components?.forEach(({ name, file }) => {
			const componentName = `customComponent_${componentIdx++}`;

			source += `
        import ${componentName} from "./${file}";
        registerLiquidComponent("${name}", ${componentName});
      `;
		});
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
