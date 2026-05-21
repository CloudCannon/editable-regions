import fs from "node:fs";
import { createRequire } from "node:module";
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
 * @param {PluginOptions} [pluginOptions] - Plugin configuration options
 * @returns {void}
 */
export default function (eleventyConfig, pluginOptions) {
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
      eleventyConfig,
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
      outfile: options.output ?? `${dirs.output}/register-components.js`,
    });
  });
}

/**
 * Creates the JavaScript source code for the live-editing client bundle.
 * Generates imports for components, filters, shortcodes, and tags.
 *
 * @param {NormalizedPluginOptions} options - Normalized plugin options
 * @param {EleventyDirectories} directories - Eleventy directory configuration
 * @param {EleventyConfig} eleventyConfig - Eleventy config, used to read registered filters
 * @param {string[]} normalizedExtensions - Lowercase, leading-dot file extensions to bundle
 * @param {Array<{inputPath?: string, outputPath?: string, url?: string}> | undefined} results - 11ty's `eleventy.after` build results
 * @returns {Promise<string>} Generated JavaScript source code
 */
async function generateLiveEditingSource(
  options,
  directories,
  eleventyConfig,
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
      import { registerEleventyBuiltins } from '@cloudcannon/editable-regions/eleventy/browser';

      setVerbose(${Boolean(options.verbose)});

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

    // Auto-mirror everything registered in eleventy.config.mjs (filters,
    // shortcodes, paired shortcodes). Built-in and override skip lists are
    // handled internally — see `handwrittenBrowserPorts`.
    source += emitAutoMirroredRegistrations(eleventyConfig, liquidOptions);

    // Register user-supplied browser-side overrides (filters, shortcodes,
    // paired shortcodes, tags). Each generates an `import` + the matching
    // `register*` call. Override names are already excluded from the
    // mirrored payload above, so there's no collision — these are the sole
    // registration for each name.
    source += emitOverrideRegistrations(liquidOptions);

    // Register user-pinned components (`pluginOptions.liquid.components`).
    // Unlike filter/shortcode overrides, these aren't replacing an
    // auto-mirrored registration — they take precedence over the
    // filesystem-resolution proxy that handles every other component name.
    source += emitComponentRegistrations(liquidOptions);

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
 * Compacts 11ty's `eleventy.after` `results` array into the page-map shape
 * the browser runtime consumes: a plain object keyed by normalized input
 * path. Paths are stripped of any leading `./` or `/` so the lookup side
 * (see `normalizeInputPath` in `liquid/page-map.mjs`) can match values
 * sourced from the CC API, which uses the no-leading-`./` form.
 *
 * Pagination produces multiple entries with the same `inputPath` — we
 * keep the first one. The page proxy and `inputPathToUrl` are about
 * resolving _a_ canonical URL for an input file; the paginated cursor
 * state (`pagination.items`, `pagination.pageNumber`) is build-time-only
 * and not something we model in the editor.
 *
 * Entries without a usable `inputPath` are skipped. Returns an empty
 * object if `results` is absent or malformed — callers treat that the
 * same as "the user opted out of the page map".
 *
 * @param {Array<{inputPath?: string, outputPath?: string, url?: string}> | undefined} results
 * @returns {Record<string, { url?: string, outputPath?: string }>}
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
 * Reads the consumer's project `package.json` and returns the subset
 * we want to expose as the `pkg` global in templates, mirroring 11ty's
 * default `pkg` exposure (`config.keys.package = "pkg"` in 11ty 3.x).
 *
 * Strips `dependencies`, `devDependencies`, `peerDependencies`,
 * `optionalDependencies`, and `scripts` before embedding — these dominate
 * `package.json` size and are essentially never read from templates. The
 * runtime wrap (see `wrapPkgWithStripWarning` in `liquid/index.mjs`)
 * surfaces a warn-once if a template does access one of these fields.
 *
 * Returns `null` if `package.json` is missing or malformed so the bundle
 * still builds; `pkg` will be absent from the engine globals in that case.
 *
 * @returns {Record<string, any> | null}
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
 * Per-kind skip lists for the auto-mirror pass: names already covered by
 * handwritten browser ports in `browser/liquid-builtins.mjs`. Drives both
 * the set of 11ty registry kinds the auto-mirror walks and the names it
 * omits within each kind.
 *
 * Non-portable entries are not detected at build time — they're shipped
 * as-is and surface as real errors when invoked in the browser; the user
 * then provides a browser-friendly replacement via
 * `pluginOptions.liquid.<kind>`.
 */
const handwrittenBrowserPorts = {
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

  for (const specName of /** @type {Array<keyof typeof handwrittenBrowserPorts>} */ (
    Object.keys(handwrittenBrowserPorts)
  )) {
    const portedNames = handwrittenBrowserPorts[specName];
    const registry = {
      ...(eleventyConfig.universal?.[specName] ?? {}),
      ...(eleventyConfig.liquid?.[specName] ?? {}),
    };
    const overrideNames = Object.keys(liquidOptions?.[specName] ?? {});
    const skip = new Set([...portedNames, ...overrideNames]);

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
 * Maps each `pluginOptions.liquid` field that takes a `{ name: modulePath }`
 * map to the runtime registration function it compiles into. Components are
 * deliberately not in this map — they're auto-discovered from the
 * filesystem (not auto-mirrored from 11ty config), so the `components`
 * option is the primary registration path for any name the user wants to
 * pin to a specific module, and it's emitted separately by
 * `emitComponentRegistrations`.
 */
const overrideRegisterFns = {
  filters: "registerFilter",
  shortcodes: "registerShortcode",
  pairedShortcodes: "registerPairedShortcode",
  tags: "registerCustomTag",
};

/**
 * Emits the `import` + register-call pair for each user-supplied override in
 * `pluginOptions.liquid`. Each entry produces:
 *
 *   import override_0 from "./path/to/file";
 *   registerFilter("name", override_0);
 *
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string}
 */
function emitOverrideRegistrations(liquidOptions) {
  let out = "";
  let i = 0;
  for (const optionKey of /** @type {Array<keyof typeof overrideRegisterFns>} */ (
    Object.keys(overrideRegisterFns)
  )) {
    const registerFn = overrideRegisterFns[optionKey];
    for (const [name, file] of Object.entries(liquidOptions?.[optionKey] ?? {})) {
      const id = `override_${i++}`;
      out += `\nimport ${id} from "./${file}";\n${registerFn}(${JSON.stringify(name)}, ${id});\n`;
    }
  }
  return out;
}

/**
 * Emits the `import` + `registerLiquidComponent` pair for each entry in
 * `pluginOptions.liquid.components`. Distinct from `emitOverrideRegistrations`
 * because components aren't auto-mirrored from 11ty config — see the comment
 * on `overrideSpecs`.
 *
 * @param {LiquidOptions | undefined} liquidOptions
 * @returns {string}
 */
function emitComponentRegistrations(liquidOptions) {
  let out = "";
  const entries = Object.entries(liquidOptions?.components ?? {});
  for (const [i, [name, file]] of entries.entries()) {
    const id = `component_${i}`;
    out += `\nimport ${id} from "./${file}";\nregisterLiquidComponent(${JSON.stringify(name)}, ${id});\n`;
  }
  return out;
}

/**
 * Normalises user-supplied plugin options into the internal shape. Each
 * supported language is resolved to either an options object (enabled) or
 * `false` (disabled). Liquid is the plugin's default language and is
 * enabled implicitly — only `liquid: false` opts out. Future languages
 * default to off and must be opted in.
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
