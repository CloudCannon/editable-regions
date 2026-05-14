import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import esbuild from "esbuild";
import { createIncludeWithTag } from "../liquid/index.mjs";
import {
  builtinFilterNames,
  builtinShortcodeNames,
} from "./browser/liquid-builtins.mjs";

/**
 * @typedef {Object} LiquidOptions
 * @property {string[]} [componentDirs] - Defaults to Eleventy's configured directories.includes
 * @property {string[]} [extensions] - Defaults to [".liquid", ".html"]
 * @property {string[]} [ignoreDirectories] - Directory names to skip (e.g., ["_drafts", "node_modules"])
 * @property {Record<string, string>} [componentOverrides] - Explicitly registered components that override dynamic resolution
 * @property {Record<string, string>} [filters] - Browser-side filter overrides, keyed by filter name with a path to a module exporting the replacement function. Filters registered in `eleventy.config.mjs` are auto-mirrored into the bundle by default; use this when a mirrored filter throws at render time in the browser (typically because it relies on Eleventy build-time state like `this.ctx`, `process`, `require`, or `__dirname`) and you need to supply a browser-friendly implementation.
 * @property {Record<string, string>} [shortcodes] - Browser-side shortcode overrides. Same auto-mirror + override model as `filters`: shortcodes registered via `addShortcode`/`addLiquidShortcode` are mirrored automatically; use this to replace any whose source can't run in the browser.
 * @property {Record<string, string>} [pairedShortcodes] - Browser-side paired-shortcode overrides. Same auto-mirror + override model as `filters`.
 * @property {Record<string, string>} [tags] - Custom Liquid tags to register in the browser engine, keyed by tag name with a path to a module exporting the tag factory `(liquidEngine) => { parse, render }`. Unlike filters/shortcodes, tags are not auto-mirrored from `addLiquidTag` — register any tag you want available during live editing here.
 */

/**
 * @typedef {Object} PluginOptions
 * @property {string} [output] - Output path for live-editing.js
 * @property {boolean} [verbose] - Enable verbose browser logging
 * @property {LiquidOptions} [liquid] - Liquid template options
 * @property {string[]} [env] - Names of environment variables to expose to live-editing templates as `process.env.NAME`. Values are read from the host `process.env` at build time and embedded in the bundle as static literals — anything not listed here (and not matched by `envPrefix`) is invisible to the browser.
 * @property {string} [envPrefix] - Convenience: any `process.env.NAME` whose name starts with this prefix is auto-included alongside `env`. Empty strings are rejected to prevent accidental leaks. Use sparingly — explicit allowlists are easier to audit.
 */

/**
 * @typedef {Object} EleventyDirectories
 * @property {string} input - Input directory
 * @property {string} includes - Includes directory (normalized, relative to project root)
 * @property {string} data - Data directory
 * @property {string} output - Output directory
 */

/**
 * Payload Eleventy passes to `eleventy.after` handlers. `directories` is the
 * Eleventy 3.x shape; `dir` is the older fallback we still accept.
 *
 * @typedef {Object} EleventyEventPayload
 * @property {EleventyDirectories} [directories]
 * @property {EleventyDirectories} [dir]
 */

/**
 * A user-supplied filter, shortcode, or paired-shortcode function. Eleventy
 * wraps these in a benchmark closure at registration time; the original is
 * recoverable via `fn.__eleventyInternal.callback`. We serialize via
 * `fn.toString()` regardless of arity, so the loose signature is fine.
 *
 * @typedef {((...args: any[]) => any) & { __eleventyInternal?: { callback?: EleventyHelper } }} EleventyHelper
 */

/**
 * A Liquid tag factory: invoked once by LiquidJS with the engine, returns
 * the `{ parse, render }` pair LiquidJS calls per occurrence. Matches the
 * shape `eleventyConfig.addLiquidTag` documents.
 *
 * @typedef {(liquidEngine: import("liquidjs").Liquid) => { parse: (...args: any[]) => void, render: (...args: any[]) => unknown }} LiquidTagFactory
 */

/**
 * Per-kind helper registry as exposed on Eleventy's user config under
 * `universal` (cross-engine) and `liquid` (Liquid-specific) in 11ty 3.x.
 *
 * @typedef {Object} EleventyHelperRegistry
 * @property {Record<string, EleventyHelper>} [filters]
 * @property {Record<string, EleventyHelper>} [shortcodes]
 * @property {Record<string, EleventyHelper>} [pairedShortcodes]
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
 * @property {EleventyHelperRegistry} [universal] - Cross-engine registry of helpers (Eleventy 3.x)
 * @property {EleventyHelperRegistry} [liquid] - Liquid-specific registry of helpers
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
    eleventyConfig.addLiquidTag("includeWith", createIncludeWithTag);
  }

  eleventyConfig.on("eleventy.after", async ({ directories, dir }) => {
    const dirs = directories ?? dir ?? eleventyConfig.dir;
    const rawExtensions = pluginOptions.liquid?.extensions ?? [
      ".liquid",
      ".html",
    ];
    const normalizedExtensions = rawExtensions.map((ext) =>
      ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
    );

    const liveEditingSource = await generateLiveEditingSource(
      pluginOptions,
      dirs,
      eleventyConfig,
      normalizedExtensions,
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
      outfile: pluginOptions.output ?? `${dirs.output}/live-editing.js`,
    });
  });
}

/**
 * Creates the JavaScript source code for the live-editing client bundle.
 * Generates imports for components, filters, shortcodes, and tags.
 *
 * @param {PluginOptions} pluginOptions - Plugin configuration options
 * @param {EleventyDirectories} directories - Eleventy directory configuration
 * @param {EleventyConfig} eleventyConfig - Eleventy config, used to read registered filters
 * @param {string[]} normalizedExtensions - Lowercase, leading-dot file extensions to bundle
 * @returns {Promise<string>} Generated JavaScript source code
 */
async function generateLiveEditingSource(
  pluginOptions,
  directories,
  eleventyConfig,
  normalizedExtensions,
) {
  let source = "";

  if (pluginOptions.liquid) {
    const componentDirs = pluginOptions.liquid.componentDirs ?? [
      directories.includes,
      directories.input,
    ];
    const ignoreDirectories = pluginOptions.liquid.ignoreDirectories ?? [
      directories.output,
      "node_modules",
    ];
    const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
      dir.toLowerCase(),
    );

    source += `
      import { createSharedLiquidEngine, registerLiquidComponent, registerFilter, registerShortcode, registerPairedShortcode, registerCustomTag, registerProcessEnv, registerEleventyData, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';
      import { registerEleventyBuiltins } from '@cloudcannon/editable-regions/eleventy/browser';

      setVerbose(${Boolean(pluginOptions.verbose)});

			// Configure the Liquid engine with component directories
			const liquidEngine = createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

			// Wire up Eleventy's built-in filters/shortcodes (browser ports) +
			// RenderPlugin shims. The engine itself is host-agnostic; this is
			// what makes it behave like Eleventy.
			registerEleventyBuiltins(liquidEngine);

    	window.cc_files = {};
  `;

    // Build the filtered env object at build time and embed it as a static
    // literal. Reading process.env happens here, in Node — never in the
    // browser. Anything not in the allowlist or matching the prefix is
    // invisible to the bundle.
    const exposedEnv = collectExposedEnv(
      pluginOptions.env,
      pluginOptions.envPrefix,
    );
    if (Object.keys(exposedEnv).length > 0) {
      source += `\nregisterProcessEnv(${JSON.stringify(exposedEnv)});\n`;
    }

    // Static `eleventy` global — version, generator, hardcoded env, and the
    // configured directories. Embedded as a literal so templates branching
    // on `eleventy.version` / `eleventy.env.runMode` see something sensible.
    const eleventyData = buildEleventyData(directories);
    source += `\nregisterEleventyData(${JSON.stringify(eleventyData)});\n`;

    // Add files we'll need to window.cc_files -
    // Then in our liquid file system we can grab them from window.cc_files during readFile
    const allLiquidFiles = await findAllLiquidFiles(
      componentDirs,
      normalizedExtensions,
      normalizedIgnoreDirs,
    );
    for (const [i, path] of allLiquidFiles.entries()) {
      const id = `liquidFile_${i}`;
      source += `import ${id} from "./${path}";

      window.cc_files["${path}"] = ${id};
      `;
    }

    // Auto-mirror everything registered in eleventy.config.mjs (filters,
    // shortcodes, paired shortcodes). Built-in and override skip lists are
    // handled internally — see `builtinNamesByKind`.
    source += emitAutoMirroredRegistrations(eleventyConfig, pluginOptions.liquid);

    // Register user-supplied browser-side overrides (filters, shortcodes,
    // paired shortcodes, tags, component overrides). Each generates an
    // `import` + the matching `registerFilter` / `registerShortcode` /
    // `registerPairedShortcode` / `registerCustomTag` /
    // `registerLiquidComponent` call. Override names are already excluded
    // from the mirrored payload above, so there's no collision — these
    // are the sole registration for each name.
    source += emitOverrideRegistrations(pluginOptions.liquid);

    // Initialize the Proxy on window.cc_components for dynamic resolution
    source += `
      initComponentProxy();
    `;
  }
  return source;
}

/**
 * Builds the `process.env` subset to ship to the browser, given the user's
 * allowlist and optional prefix. Treats both inputs as opt-in: with neither
 * set, the result is empty and no `process` global is registered.
 *
 * Empty-string prefixes are ignored — `"".startsWith("")` is true for every
 * env var, which would silently leak the entire host environment.
 *
 * @param {string[] | undefined} allowlist - Explicit names to include
 * @param {string | undefined} prefix - Names with this prefix are auto-included
 * @returns {Record<string, string>}
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
 * Builds the static `eleventy` global that the live-editing bundle exposes
 * in place of Eleventy's build-time data of the same name. Mirrors the parts
 * of https://www.11ty.dev/docs/data-eleventy-supplied/ that make sense in a
 * browser, with deliberate omissions:
 *   - `env.config` and `env.root` are dropped (absolute filesystem paths
 *     don't belong in client JS).
 *   - `env.runMode` is hardcoded to `"serve"` — we're not in any of 11ty's
 *     real run modes, but "serve" is the dev-mode analogue and gives
 *     templates branching on this the right code path.
 *   - `env.source` is hardcoded to `"cli"`.
 *   - `serverless` is omitted (deprecated upstream).
 *
 * @param {EleventyDirectories} directories
 * @returns {{version: string, generator: string, env: {runMode: string, source: string}, directories: EleventyDirectories}}
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
 * Reads the installed Eleventy version from its `package.json`. Resolved
 * from this module's location, which works for the typical hoisted-deps
 * layout. Returns `"unknown"` if Eleventy can't be resolved (e.g. the
 * package isn't installed where we'd expect) so the bundle still builds.
 *
 * @returns {string}
 */
function readEleventyVersion() {
  try {
    const require = createRequire(import.meta.url);
    /** @type {{version: string}} */
    const pkg = require("@11ty/eleventy/package.json");
    return pkg.version;
  } catch {
    return "unknown";
  }
}

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

/**
 * Per-kind built-in skip lists. Drives both the set of kinds the auto-mirror
 * walks and the names it omits within each kind (since those are already
 * covered by handwritten browser ports — see `browser/liquid-builtins.mjs`).
 *
 * Non-portable entries are not detected at build time — they're shipped
 * as-is and surface as real errors when invoked in the browser; the user
 * then provides a browser-friendly replacement via
 * `pluginOptions.liquid.<kind>`.
 */
const builtinNamesByKind = {
  filters: builtinFilterNames,
  shortcodes: builtinShortcodeNames,
  pairedShortcodes: /** @type {string[]} */ ([]),
};

/**
 * Auto-mirrors all functions registered in the user's Eleventy config into
 * the browser bundle — filters, shortcodes, and paired shortcodes. For each
 * kind, pulls from both `universal` (cross-engine) and the liquid-specific
 * registry; liquid-specific wins on name collisions.
 *
 * Two skip sources, both handled here so the caller doesn't repeat itself:
 *   - the kind's built-in list (names already covered by handwritten ports)
 *   - names the user has overridden via `pluginOptions.liquid.<kind>`
 *     (registered separately by `emitOverrideRegistrations` so overrides win)
 *
 * Every surviving entry is unwrapped from Eleventy's benchmark closure and
 * embedded verbatim via `fn.toString()`. If a function depends on
 * Eleventy build-time state (`this.ctx`, `process`, `require`, ...) it'll
 * throw at render time in the browser — that's the signal to register an
 * override. We deliberately don't try to detect this at build time: any
 * regex-based check would have false positives that block portable code
 * and false negatives that ship broken code anyway.
 *
 * @param {EleventyConfig} eleventyConfig
 * @param {LiquidOptions | undefined} liquidOptions - Used to find user-supplied overrides to skip
 * @returns {string} JS source to append to the bundle (empty if nothing to register)
 */
function emitAutoMirroredRegistrations(eleventyConfig, liquidOptions) {
  let out = "";

  for (const specName of /** @type {Array<keyof typeof builtinNamesByKind>} */ (
    Object.keys(builtinNamesByKind)
  )) {
    const builtins = builtinNamesByKind[specName];
    const registry = {
      ...(eleventyConfig.universal?.[specName] ?? {}),
      ...(eleventyConfig.liquid?.[specName] ?? {}),
    };
    const overrideNames = Object.keys(liquidOptions?.[specName] ?? {});
    const skip = new Set([...builtins, ...overrideNames]);

    // Derive the runtime register fn: "filters" -> registerFilter,
    // "pairedShortcodes" -> registerPairedShortcode (strip trailing s).
    const registerFnName = `register${specName[0].toUpperCase()}${specName.slice(1, -1)}`;

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

      // Wrap the stringified function in parens so `function name(...) {}` or
      // `async function(){}` parses as an expression in argument position.
      out += `\n${registerFnName}(${JSON.stringify(name)}, (${original.toString()}));\n`;
    }
  }

  return out;
}

/**
 * Per-kind configuration for user-supplied browser-side overrides, keyed by
 * the matching `pluginOptions.liquid` field. Each row gives the runtime
 * register function the import gets compiled into and an identifier prefix
 * for the generated import binding.
 */
const overrideSpecs = {
  filters: { registerFn: "registerFilter", idPrefix: "overrideFilter" },
  shortcodes: {
    registerFn: "registerShortcode",
    idPrefix: "overrideShortcode",
  },
  pairedShortcodes: {
    registerFn: "registerPairedShortcode",
    idPrefix: "overridePairedShortcode",
  },
  tags: { registerFn: "registerCustomTag", idPrefix: "tag" },
  componentOverrides: {
    registerFn: "registerLiquidComponent",
    idPrefix: "componentOverride",
  },
};

/**
 * Emits the `import` + register-call pair for each user-supplied override in
 * `pluginOptions.liquid`. Each entry produces:
 *
 *   import overrideFilter_0 from "./path/to/file";
 *   registerFilter("name", overrideFilter_0);
 *
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string}
 */
function emitOverrideRegistrations(liquidOptions) {
  let out = "";
  for (const optionKey of /** @type {Array<keyof typeof overrideSpecs>} */ (
    Object.keys(overrideSpecs)
  )) {
    const { registerFn, idPrefix } = overrideSpecs[optionKey];
    const overrideEntries = Object.entries(liquidOptions?.[optionKey] ?? {});
    for (const [i, [name, file]] of overrideEntries.entries()) {
      const id = `${idPrefix}_${i}`;
      out += `\nimport ${id} from "./${file}";\n${registerFn}(${JSON.stringify(name)}, ${id});\n`;
    }
  }
  return out;
}
