import { evalToken, Liquid, Tokenizer, toPromise } from "liquidjs";
import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.mjs";
import { registerEleventyBuiltins } from "./11ty-builtins.mjs";
import { inMemoryFs } from "./fs.mjs";
import { group, groupEnd, log } from "./logger.mjs";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.mjs";

// Re-export logger utilities for external use
export { group, groupEnd, log, setVerbose } from "./logger.mjs";

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/**
 * Creates and configures the shared Liquid engine instance.
 *
 * @param {{componentDirs?: string[]}} options - Liquid engine options
 * @returns {void}
 */
export function createSharedLiquidEngine(options) {
  log("Creating shared Liquid engine");

  sharedLiquidEngine = new Liquid({
    fs: inMemoryFs,
    globals: {
      ENV_CLIENT: true,
      collections: collectionsProxy,
      page: pageProxy,
    },
    ...options,
  });
  log("Liquid engine instantiated");

  registerEleventyBuiltins(sharedLiquidEngine);
  log("Eleventy built-ins registered (filters + RenderPlugin shims)");

  log(
    "Available files in window.cc_files:",
    Object.keys(window.cc_files || {}),
  );

  sharedLiquidEngine.registerTag(
    "includeWith",
    createIncludeWithTag(sharedLiquidEngine),
  );
  log("includeWith tag registered");
}

/**
 * Registers a Liquid component under `key`, taking precedence over the
 * include-resolution proxy installed by `initComponentProxy` for that name.
 * Use this when you need to substitute a different template — typically via
 * `pluginOptions.liquid.componentOverrides` — for a name that would
 * otherwise resolve to its auto-discovered file via `{% include %}`.
 *
 * @param {string} key - Unique identifier for the component
 * @param {string} contents - The Liquid template contents
 * @returns {void}
 */
export function registerLiquidComponent(key, contents) {
  log("Registering component:", key);
  log("Component contents preview:", contents?.substring?.(0, 200) || contents);

  if (!sharedLiquidEngine) {
    throw new Error(
      `sharedLiquidEngine not defined when registering component ${key}`,
    );
  }

  window.cc_components = window.cc_components || {};
  window.cc_components[key] = createComponentRenderer(key, contents);
  log(`Component registered, ${key}`);
}

/**
 * Wraps `window.cc_components` in a Proxy that resolves any component name
 * to a renderer on demand. Each lookup returns a renderer that delegates to
 * Liquid's `{% include %}` tag, which finds the matching file via the
 * engine's configured `root` and `extname` (populated at build time from
 * `findAllLiquidFiles`). This is the primary resolution path.
 *
 * Names explicitly registered via `registerLiquidComponent` take precedence
 * — those are returned as-is rather than going through include resolution.
 *
 * Must be called after `createSharedLiquidEngine()`.
 *
 * @returns {void}
 */
export function initComponentProxy() {
  if (!sharedLiquidEngine) {
    throw new Error(
      "sharedLiquidEngine not defined when initializing component proxy",
    );
  }

  const target = window.cc_components || {};

  window.cc_components = new Proxy(target, {
    get(registered, key, receiver) {
      // Explicit registrations take precedence over include resolution
      if (Reflect.has(registered, key)) {
        return Reflect.get(registered, key, receiver);
      }
      // Resolve via Liquid's include — the primary path for auto-discovered components
      if (typeof key === "string") {
        return createComponentRenderer(key, `{% include "${key}" %}`);
      }
      return undefined;
    },
  });

  log("Component proxy initialized");
}

/**
 * Sets the `eleventy` global on the shared Liquid engine, mirroring the
 * subset of https://www.11ty.dev/docs/data-eleventy-supplied/ that makes
 * sense in a browser. The bundle generator builds the data at build time;
 * this function is a thin setter.
 *
 * @param {{version: string, generator: string, env: {runMode: string, source: string}, directories: Record<string, string>}} data
 * @returns {void}
 */
export function registerEleventyData(data) {
  if (!sharedLiquidEngine) {
    throw new Error(
      "sharedLiquidEngine not defined when registering eleventy data",
    );
  }
  /** @type {any} */ (sharedLiquidEngine).globals.eleventy = data;
  log("Registered eleventy data, version:", data?.version);
}

/**
 * Sets the `process.env` global on the shared Liquid engine so templates can
 * read build-time environment variables via `{{ process.env.NAME }}`. The
 * bundle generator builds `env` from the user's allowlist
 * (`pluginOptions.env`) and/or prefix (`pluginOptions.envPrefix`) at build
 * time; this function never reads `process.env` itself.
 *
 * @param {Record<string, string>} env
 * @returns {void}
 */
export function registerProcessEnv(env) {
  if (!sharedLiquidEngine) {
    throw new Error(
      "sharedLiquidEngine not defined when registering process.env",
    );
  }
  /** @type {any} */ (sharedLiquidEngine).globals.process = { env };
  log("Registered", Object.keys(env).length, "process.env vars");
}

/**
 * Registers a Liquid filter. Called by both the build-time auto-mirror pass
 * (with the user's `eleventyConfig.addFilter` function) and by user-supplied
 * browser overrides (`pluginOptions.liquid.filters`). The Eleventy plugin
 * emits one call per name; overrides emitted last win on collision, but the
 * mirror pass already skips override names so collisions shouldn't arise.
 *
 * @param {string} name
 * @param {any} fn
 * @returns {void}
 */
export function registerFilter(name, fn) {
  log("Registering filter:", name);
  if (!sharedLiquidEngine) {
    throw new Error(
      `sharedLiquidEngine not defined when registering filter ${name}`,
    );
  }
  sharedLiquidEngine.registerFilter(name, fn);
}

/**
 * Registers a Liquid shortcode. Same dual-caller pattern as
 * `registerFilter` — used by both the auto-mirror pass and user overrides.
 *
 * Usage in templates: {% shortcodeName arg1, arg2 %}
 *
 * @param {string} name
 * @param {any} fn - (arg1, arg2, ...) => string
 * @returns {void}
 */
export function registerShortcode(name, fn) {
  log("Registering shortcode:", name);
  if (!sharedLiquidEngine) {
    throw new Error(
      `sharedLiquidEngine not defined when registering shortcode ${name}`,
    );
  }
  sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
}

/**
 * Registers a Liquid paired shortcode (with content between tags). Same
 * dual-caller pattern as `registerFilter`.
 *
 * Usage in templates: {% shortcodeName arg %}content{% endshortcodeName %}
 *
 * @param {string} name
 * @param {any} fn - (content, arg1, ...) => string
 * @returns {void}
 */
export function registerPairedShortcode(name, fn) {
  log("Registering paired shortcode:", name);
  if (!sharedLiquidEngine) {
    throw new Error(
      `sharedLiquidEngine not defined when registering paired shortcode ${name}`,
    );
  }
  sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
}

/**
 * Registers a custom tag with full LiquidJS parser access.
 *
 * Custom tags are more powerful than shortcodes - they receive full access to
 * the LiquidJS parser and can implement complex parsing/rendering logic.
 *
 * Usage in templates: {% tagName args %}
 *
 * @param {string} name - The tag name
 * @param {any} factory - Factory function (liquidEngine) => { parse(), render() }
 * @returns {void}
 */
export function registerCustomTag(name, factory) {
  log("Registering custom tag:", name);
  if (!sharedLiquidEngine) {
    throw new Error(
      `sharedLiquidEngine not defined when registering custom tag ${name}`,
    );
  }
  sharedLiquidEngine.registerTag(name, factory(sharedLiquidEngine));
}

/**
 * Creates an includeWith tag for spreading object props into includes.
 * Like Astro's {...props} spread for Liquid includes.
 *
 * Usage: {% includeWith "path/to/partial", objectToSpread %}
 *
 * @param {any} _liquidEngine - The LiquidJS engine instance (provided by LiquidJS, accessed via this.liquid)
 * @returns {any} Tag implementation with parse and render methods
 */
export function createIncludeWithTag(_liquidEngine) {
  return {
    /**
     * Parses the includeWith tag arguments.
     * @param {any} tagToken - The tag token from LiquidJS parser
     */
    parse(tagToken) {
      log("includeWith parsing tag with args:", tagToken.args);
      const tokenizer = new Tokenizer(
        tagToken.args,
        this.liquid.options.operatorsTrie,
      );

      this.pathToken = tokenizer.readValue();
      if (!this.pathToken)
        throw new Error("includeWith: missing path argument");
      log("includeWith parsed path token:", this.pathToken);

      tokenizer.skipBlank();
      if (tokenizer.peek() !== ",")
        throw new Error("includeWith: expected comma separator");
      tokenizer.advance();
      tokenizer.skipBlank();

      this.objectToken = tokenizer.readValue();
      if (!this.objectToken)
        throw new Error("includeWith: missing object argument");
      log("includeWith parsed object token:", this.objectToken);
    },

    /**
     * Renders the included template with spread props.
     * @param {any} context - The LiquidJS render context
     */
    async render(context) {
      group("includeWith rendering");
      log("Evaluating path token...");
      const path = await toPromise(evalToken(this.pathToken, context));
      log("Path resolved to:", path);

      log("Evaluating object token...");
      const obj = await toPromise(evalToken(this.objectToken, context));
      log("Object resolved to:", obj);

      if (!path || typeof path !== "string") {
        groupEnd();
        throw new Error(`includeWith: invalid path "${path}"`);
      }
      if (!obj || typeof obj !== "object") {
        log("Object is not valid, returning empty");
        groupEnd();
        return;
      }

      log(
        "Including:",
        path,
        "with",
        Object.keys(obj).length,
        "props:",
        Object.keys(obj),
      );

      context.push(obj);
      try {
        log("Parsing file:", path);
        const templates = await this.liquid.parseFile(path);
        log("File parsed, template count:", templates?.length || 0);

        log("Rendering templates...");
        const result = await this.liquid.render(templates, context);
        log("Rendered result preview:", result?.substring?.(0, 200) || result);
        groupEnd();
        return result;
      } catch (err) {
        const error = /** @type {Error} */ (err);
        log("Error during render:", error.message);
        log("Full error:", error);
        groupEnd();
        throw enhanceLiquidError(err, `includeWith "${path}"`);
      } finally {
        context.pop();
      }
    },
  };
}

/**
 * Returns the async render function used by both code paths that produce
 * a component renderer: the include-resolution proxy installed by
 * `initComponentProxy` (the primary path) and explicit registrations made
 * via `registerLiquidComponent`. Wraps `parseAndRender` with logging,
 * error mapping, and HTMLElement output.
 *
 * @param {string} name - Component name; used for log groups and error messages
 * @param {string} templateSource - Liquid source to render (a literal template, or `{% include "name" %}`)
 * @returns {(props: Record<string, any>) => Promise<HTMLElement>}
 */
function createComponentRenderer(name, templateSource) {
  return async (props) => {
    if (!sharedLiquidEngine) {
      throw new Error(
        `sharedLiquidEngine not defined when rendering component ${name}`,
      );
    }
    group(`Rendering component: ${name}`);
    log("Props:", props);
    log("Parsing and rendering template...");
    let htmlString;
    try {
      htmlString = await sharedLiquidEngine.parseAndRender(
        templateSource,
        props,
      );
    } catch (err) {
      log("Error during render:", err);
      groupEnd();
      throw enhanceLiquidError(err, name);
    }
    log(
      "Rendered HTML preview:",
      htmlString?.substring?.(0, 200) || htmlString,
    );
    const rootEl = document.createElement("div");
    rootEl.innerHTML = htmlString;
    groupEnd();
    return rootEl;
  };
}

/**
 * Inspects a LiquidJS error and returns a new Error with a more
 * descriptive, actionable message for the editable-region error card.
 *
 * @param {unknown} err - The original error
 * @param {string} componentName - The component or template being rendered
 * @returns {Error} An enhanced error with a user-friendly message
 */
function enhanceLiquidError(err, componentName) {
  const message = err instanceof Error ? err.message : String(err);

  const unknownFilter = message.match(/undefined filter[:.]?\s*(\S+)/i);
  if (unknownFilter) {
    const filterName = unknownFilter[1];
    return new Error(
      `Unknown filter "${filterName}" while rendering "${componentName}". ` +
        `Please check your config and make sure you have registered "${filterName}" in the filters option.`,
    );
  }

  const missingTemplate = message.match(/ENOENT.*?"([^"]+)"/);
  if (missingTemplate) {
    const filePath = missingTemplate[1];
    return new Error(
      `Failed to find included template "${filePath}" while rendering "${componentName}". ` +
        `Please check that the file exists and is within your configured component directories.`,
    );
  }

  const missingTag = message.match(/tag "?(\S+?)"? not found/i);
  if (missingTag) {
    const tagName = missingTag[1];
    return new Error(
      `Unknown tag "${tagName}" while rendering "${componentName}". ` +
        `Please check your config and make sure you have registered "${tagName}" in the tags, shortcodes, or pairedShortcodes option.`,
    );
  }

  return new Error(`Error rendering "${componentName}": ${message}`);
}

// Proxy exposed as the `collections` global on the Liquid engine. Property
// reads kick off an async fetch via the CloudCannon live-editing API; Liquid
// awaits the returned thenable wherever the value is consumed (for-loops,
// filter args, output expressions).
const collectionsProxy = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      return resolveCollection(key);
    },
  },
);

/**
 * Lazily resolves a CloudCannon collection by key into an array of items
 * suitable for Liquid templates. Each item is realized to plain data so
 * Liquid filters/iteration work without further awaiting nested fields.
 *
 * Item shape is best-effort 11ty-ish (`url`, `inputPath`, `data`); the CC
 * collection layout is not guaranteed to match what Eleventy would have
 * produced.
 *
 * @param {string} key
 * @returns {Promise<Array<{url: any, inputPath: string, data: any}>>}
 */
async function resolveCollection(key) {
  await apiLoadedPromise;
  const collection = CloudCannon.collection(key);
  const files = await collection.items();
  return Promise.all(
    files.map(async (file) => {
      const data = await file.data.get();
      return {
        url: file.url ?? file.path,
        inputPath: file.path,
        data,
      };
    }),
  );
}

// Proxy exposed as the `page` global on the Liquid engine. Mirrors 11ty's
// `page` object as closely as we can from the Visual Editor API; properties we
// can't derive from `currentFile()` resolve to `undefined`. Like
// `collectionsProxy`, property reads return Promises that liquidjs awaits.
const pageProxy = new Proxy(
  {},
  {
    get(_target, key) {
      // Guard against accidental thenable detection: if liquidjs (or any
      // awaiting code) inspects `page.then`, returning a Promise here would
      // make the proxy itself look like a thenable and trigger recursive
      // resolution.
      if (key === "then") return undefined;
      if (typeof key !== "string") return undefined;
      return resolvePageProperty(key);
    },
  },
);

/**
 * Resolves a single property of the `page` global against the currently
 * edited file in the Visual Editor. Returns undefined for properties we
 * can't reliably reconstruct without Eleventy build-time state
 * (`outputPath`, `templateSyntax`, `lang`).
 *
 * @param {string} key
 * @returns {Promise<any>}
 */
async function resolvePageProperty(key) {
  await apiLoadedPromise;
  const file = CloudCannon?.currentFile?.();
  if (!file) return undefined;

  const inputPath = file.path;

  switch (key) {
    case "inputPath":
      return inputPath;
    case "fileSlug": {
      const base = inputPath.split("/").pop() ?? "";
      return stripExtension(base);
    }
    case "filePathStem": {
      const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
      return stem.startsWith("/") ? stem : `/${stem}`;
    }
    case "outputFileExtension":
      return "html";
    case "date": {
      const data = (await file.data.get()) ?? {};
      const raw = /** @type {any} */ (data).date;
      if (!raw) return undefined;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case "url": {
      const data = (await file.data.get()) ?? {};
      const permalink = /** @type {any} */ (data).permalink;
      if (typeof permalink === "string") return permalink;
      return deriveDefaultUrl(inputPath);
    }
    default:
      return undefined;
  }
}

/**
 * 11ty's default folder-style permalink: every input path becomes a URL with a
 * trailing slash, with `index` files mapping to the parent directory. Used as
 * the fallback when no front matter `permalink` is set.
 *
 * @param {string} inputPath
 * @returns {string}
 */
function deriveDefaultUrl(inputPath) {
  const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
  const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
  const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
  return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

/**
 * Strips the file extension from a path.
 * @param {string} p
 * @returns {string}
 */
function stripExtension(p) {
  return p.replace(/\.[^./]+$/, "");
}
