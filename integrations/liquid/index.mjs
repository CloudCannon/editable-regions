import { Liquid } from "liquidjs";
import { enhanceLiquidError } from "./errors.mjs";
import { inMemoryFs } from "./fs.mjs";
import {
  collectionsProxy,
  pageProxy,
  setEleventyData,
} from "./globals.mjs";
import { createIncludeWithTag } from "./include-with-tag.mjs";
import { group, groupEnd, log, warnOnce } from "./logger.mjs";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.mjs";

// Re-export logger utilities for external use
export { group, groupEnd, log, setVerbose } from "./logger.mjs";
// Re-export so browser-bundle consumers can keep importing from the package
// root — the definition lives in `./include-with-tag.mjs` so the Node-side
// Eleventy plugin can import it without pulling in browser-runtime modules.
export { createIncludeWithTag } from "./include-with-tag.mjs";
// `registerPageMap` is part of the runtime's public surface; the storage
// lives in `./page-map.mjs` so non-engine consumers (`globals.mjs`,
// `liquid-builtins.mjs`) can read it without an import cycle through here.
export { registerPageMap } from "./page-map.mjs";

// `registerPkg` is defined below alongside the other engine-globals
// register functions (`registerEleventyData`, `registerProcessEnv`). The
// bundle's emitted import line pulls it from here.

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/**
 * Creates and configures the shared Liquid engine instance. Host-agnostic
 * — the host (Eleventy, Jekyll, …) is expected to wire up its own filters,
 * shortcodes, and built-in ports after this call via the registration
 * functions exported below. The returned engine should be passed to any
 * host-side wiring (e.g. `registerEleventyBuiltins(engine)`).
 *
 * @param {import("liquidjs").LiquidOptions} [options] - Spread into `new Liquid(...)` (`root`, `extname`, `strictFilters`, etc.)
 * @returns {import("liquidjs").Liquid}
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

  log(
    "Available files in window.cc_liquid_files:",
    Object.keys(window.cc_liquid_files || {}),
  );

  sharedLiquidEngine.registerTag(
    "includeWith",
    createIncludeWithTag(sharedLiquidEngine),
  );
  log("includeWith tag registered");

  return sharedLiquidEngine;
}

/**
 * Registers a Liquid component under `key`, taking precedence over the
 * include-resolution proxy installed by `initComponentProxy` for that name.
 * Use this when you need to pin a different template — typically via
 * `pluginOptions.liquid.components` — for a name that would otherwise
 * resolve to its auto-discovered file via `{% include %}`.
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
  /** @type {any} */ (sharedLiquidEngine).options.globals.eleventy = data;
  // Also surface to the `globals` module so the page proxy can derive
  // `outputPath` without reaching into the engine.
  setEleventyData(data);
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
  /** @type {any} */ (sharedLiquidEngine).options.globals.process = { env };
  log("Registered", Object.keys(env).length, "process.env vars");
}

/**
 * Field names stripped from the user's `package.json` before it's embedded
 * in the bundle. These tend to dominate `package.json` size (hundreds of
 * dependency entries, dozens of npm scripts) and aren't typically read
 * from templates. Accessing one of these from a template returns
 * `undefined` and warns once (see `wrapPkgWithStripWarning` below).
 */
const STRIPPED_PKG_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "scripts",
];

/**
 * Wraps the embedded `pkg` value in a Proxy so reads of known-stripped
 * fields surface a useful warn-once message instead of silently returning
 * `undefined`. Unknown property reads (typos, conditional checks against
 * fields not present in the user's package.json) still return `undefined`
 * silently — we only special-case the names we deliberately strip.
 *
 * @param {Record<string, any>} pkg
 * @returns {Record<string, any>}
 */
function wrapPkgWithStripWarning(pkg) {
  const stripped = new Set(STRIPPED_PKG_FIELDS);
  return new Proxy(pkg, {
    get(target, key, receiver) {
      if (
        typeof key === "string" &&
        stripped.has(key) &&
        !(key in target)
      ) {
        warnOnce(
          `pkg-stripped:${key}`,
          `pkg.${key} isn't available in live editing. The editable-regions ` +
            `Eleventy plugin strips ${STRIPPED_PKG_FIELDS.join(", ")} from ` +
            "the embedded package.json to keep the bundle small. If your " +
            "template needs this field, open an issue.",
        );
        return undefined;
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

/**
 * Sets the `pkg` global on the shared Liquid engine, mirroring 11ty's
 * default exposure of the project `package.json` as the `pkg` global. The
 * generator (`integrations/eleventy/index.mjs:buildPkg`) reads
 * `package.json` once at build time and strips the heavy fields listed in
 * `STRIPPED_PKG_FIELDS`; this function wraps the result in a Proxy so
 * reads of those stripped fields surface a helpful warning instead of
 * silent `undefined`.
 *
 * @param {Record<string, any>} pkg
 * @returns {void}
 */
export function registerPkg(pkg) {
  if (!sharedLiquidEngine) {
    throw new Error("sharedLiquidEngine not defined when registering pkg");
  }
  /** @type {any} */ (sharedLiquidEngine).options.globals.pkg =
    wrapPkgWithStripWarning(pkg ?? {});
  log("Registered pkg, fields:", Object.keys(pkg ?? {}).length);
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
  sharedLiquidEngine.registerTag(name, createShortcodeTag(name, fn));
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

