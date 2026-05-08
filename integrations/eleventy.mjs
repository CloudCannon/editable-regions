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
 * @property {Record<string, string>} [shortcodes] - Browser-side shortcode overrides. Same auto-mirror + override model as `filters`: shortcodes registered via `addShortcode`/`addLiquidShortcode` are mirrored automatically; use this to replace any whose source can't run in the browser.
 * @property {Record<string, string>} [pairedShortcodes] - Browser-side paired-shortcode overrides. Same auto-mirror + override model as `filters`.
 * @property {Record<string, string>} [tags] - Custom Liquid tags to register in the browser engine, keyed by tag name with a path to a module exporting the tag factory `(liquidEngine) => { parse, render }`. Unlike filters/shortcodes, tags are not auto-mirrored from `addLiquidTag` — register any tag you want available during live editing here.
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
 * Walks a registry of Eleventy-registered functions (filters, shortcodes,
 * paired shortcodes, or tag factories) and emits a `registerMirroredX({...})`
 * call for the bundle.
 *
 * For each entry not in `skipNames`, unwraps Eleventy's benchmark closure,
 * serializes via `fn.toString()`, and runs `classifyMirroredSource`. Portable
 * sources are embedded verbatim; non-portable ones either fall back to a
 * stub built by `buildStub`, or are skipped if no stub builder is provided.
 *
 * @param {Object} args
 * @param {Record<string, any>} args.registry - Map of name -> function
 * @param {string} args.registerFnName - Name of the runtime register function
 * @param {string[]} args.skipNames - Names to omit (already covered or overridden)
 * @param {((name: string, reason: string) => string) | undefined} args.buildStub - Builder for non-portable fallback source; omit to skip non-portable entries entirely
 * @returns {string} JS source to append to the bundle (empty if nothing to register)
 */
function serializeMirroredFunctions({
  registry,
  registerFnName,
  skipNames,
  buildStub,
}) {
  const skip = new Set(skipNames);
  const entries = [];

  for (const [name, fn] of Object.entries(registry)) {
    if (skip.has(name)) continue;
    if (typeof fn !== "function") continue;

    // Eleventy wraps every registered filter/shortcode in a benchmark closure
    // (see @11ty/eleventy/src/Benchmark/BenchmarkGroup.js), which references
    // local `callback`/`benchmark` identifiers that don't exist in the
    // browser. The original user function is hung off the wrapper via
    // `__eleventyInternal.callback` — use that for serialization.
    const original = fn.__eleventyInternal?.callback ?? fn;
    if (typeof original !== "function") continue;

    const source = original.toString();
    const classification = classifyMirroredSource(source);
    const nameLit = JSON.stringify(name);

    if (classification.portable) {
      // Wrap in parens so `function name(...) {}` or `async function(){}`
      // parses as an expression in an object literal.
      entries.push(`  ${nameLit}: (${source})`);
    } else if (buildStub) {
      entries.push(
        `  ${nameLit}: ${buildStub(name, classification.reason)}`,
      );
    }
    // else: non-portable + no stub builder => omit entirely
  }

  if (entries.length === 0) return "";

  return `\n${registerFnName}({\n${entries.join(",\n")}\n});\n`;
}

/**
 * Tier 2 mirror for filters. See `serializeMirroredFunctions`.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {string[]} skipNames - Filter names to omit (Tier 1 + Tier 3)
 * @returns {string}
 */
function serializeMirroredFilters(eleventyConfig, skipNames) {
  /** @type {any} */
  const cfg = eleventyConfig;
  // Pull from both universal (cross-engine) and liquid-specific registries.
  // Liquid-specific wins on name collisions (more specific registration).
  const registry = {
    ...(cfg?.universal?.filters ?? {}),
    ...(cfg?.liquid?.filters ?? {}),
  };
  return serializeMirroredFunctions({
    registry,
    registerFnName: "registerMirroredFilters",
    skipNames,
    buildStub: (name, reason) =>
      buildPassthroughStub({ kind: "filter", name, reason }),
  });
}

/**
 * Auto-mirror for non-paired shortcodes registered in the user's eleventy
 * config. Non-portable shortcodes fall back to a warn-once empty-string stub.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {string[]} skipNames - Names overridden via plugin options
 * @returns {string}
 */
function serializeMirroredShortcodes(eleventyConfig, skipNames) {
  /** @type {any} */
  const cfg = eleventyConfig;
  const registry = {
    ...(cfg?.universal?.shortcodes ?? {}),
    ...(cfg?.liquid?.shortcodes ?? {}),
  };
  return serializeMirroredFunctions({
    registry,
    registerFnName: "registerMirroredShortcodes",
    skipNames,
    buildStub: (name, reason) =>
      buildEmptyStringStub({ kind: "shortcode", name, reason }),
  });
}

/**
 * Auto-mirror for paired shortcodes. Non-portable entries fall back to a
 * warn-once stub that returns the inner content unchanged.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {string[]} skipNames
 * @returns {string}
 */
function serializeMirroredPairedShortcodes(eleventyConfig, skipNames) {
  /** @type {any} */
  const cfg = eleventyConfig;
  const registry = {
    ...(cfg?.universal?.pairedShortcodes ?? {}),
    ...(cfg?.liquid?.pairedShortcodes ?? {}),
  };
  return serializeMirroredFunctions({
    registry,
    registerFnName: "registerMirroredPairedShortcodes",
    skipNames,
    buildStub: (name, reason) =>
      buildContentPassthroughStub({ kind: "paired shortcode", name, reason }),
  });
}

/**
 * Heuristic check for whether stringified function source can be safely
 * shipped to the browser. Returns `{portable: true}` when the source is
 * self-contained or `{portable: false, reason}` when it references things we
 * can't recreate. Applies equally to filters, shortcodes, and tag factories.
 *
 * @param {string} source
 * @returns {{portable: true} | {portable: false, reason: string}}
 */
function classifyMirroredSource(source) {
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
 * Shared warn-once wrapper used by every stub variant. Emits a self-contained
 * IIFE that returns a function with the supplied body and warns the first time
 * it's invoked.
 *
 * @param {string} message - JSON-stringified warning message
 * @param {string} signature - Parameter list, e.g. "value" or "...args"
 * @param {string} returnExpr - Expression returned from the stub
 * @returns {string}
 */
function buildWarnOnceStub(message, signature, returnExpr) {
  return `(() => {
    let warned = false;
    return (${signature}) => {
      if (!warned) { warned = true; console.warn(${message}); }
      return ${returnExpr};
    };
  })()`;
}

/**
 * Stub for filters: returns the piped value unchanged so `{{ x | broken }}`
 * still renders something sensible.
 *
 * @param {{kind: string, name: string, reason: string}} args
 * @returns {string}
 */
function buildPassthroughStub({ kind, name, reason }) {
  const message = JSON.stringify(
    `Eleventy ${kind} "${name}" is not supported in live editing (${reason}). Returning the input unchanged.`,
  );
  return buildWarnOnceStub(message, "value", "value");
}

/**
 * Stub for non-paired shortcodes: returns "" since the original output is
 * unrecoverable but the surrounding template still needs to render.
 *
 * @param {{kind: string, name: string, reason: string}} args
 * @returns {string}
 */
function buildEmptyStringStub({ kind, name, reason }) {
  const message = JSON.stringify(
    `Eleventy ${kind} "${name}" is not supported in live editing (${reason}). Returning an empty string.`,
  );
  return buildWarnOnceStub(message, "...args", '""');
}

/**
 * Stub for paired shortcodes: returns the inner content unchanged so the
 * surrounded markup still appears in the rendered preview.
 *
 * @param {{kind: string, name: string, reason: string}} args
 * @returns {string}
 */
function buildContentPassthroughStub({ kind, name, reason }) {
  const message = JSON.stringify(
    `Eleventy ${kind} "${name}" is not supported in live editing (${reason}). Returning the wrapped content unchanged.`,
  );
  return buildWarnOnceStub(message, "content, ...args", "content");
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
      import { createSharedLiquidEngine, registerLiquidComponent, registerCustomFilter, registerCustomShortcode, registerCustomPairedShortcode, registerCustomTag, registerMirroredFilters, registerMirroredShortcodes, registerMirroredPairedShortcodes, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';

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

    // Auto-mirror anything registered in eleventy.config.mjs (filters,
    // shortcodes, paired shortcodes, tags). For each kind:
    //   - skip names we already cover with handwritten ports (filters Tier 1)
    //   - skip names overridden via plugin options (registered just below)
    // so that overrides always win.
    const filterOverrideNames = Object.keys(pluginOptions.liquid?.filters ?? {});
    source += serializeMirroredFilters(eleventyConfig, [
      ...tier1FilterNames,
      ...filterOverrideNames,
    ]);

    const shortcodeOverrideNames = Object.keys(
      pluginOptions.liquid?.shortcodes ?? {},
    );
    source += serializeMirroredShortcodes(eleventyConfig, shortcodeOverrideNames);

    const pairedShortcodeOverrideNames = Object.keys(
      pluginOptions.liquid?.pairedShortcodes ?? {},
    );
    source += serializeMirroredPairedShortcodes(
      eleventyConfig,
      pairedShortcodeOverrideNames,
    );

    // Register filter overrides
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

    // Register shortcode overrides
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

    // Register paired shortcode overrides
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

    // Register tag overrides
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
