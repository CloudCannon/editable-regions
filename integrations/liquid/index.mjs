import { Liquid, Tokenizer, evalToken, toPromise } from "liquidjs";
import { createInMemoryFs } from "./fs.mjs";
import { createShortcodeFactories } from "./shortcodes.mjs";
import { log, group, groupEnd } from "./logger.mjs";
import { eleventyFilters } from "./11ty-filters.mjs";

// Re-export logger utilities for external use
export { setVerbose, log, group, groupEnd } from "./logger.mjs";

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/** @type {{componentDirs?: string[]}} */
let liquidEngineConfig = {};

/** @type {{name: string, fn: any}[]} */
const customFilters = [];

/** @type {{name: string, fn: any}[]} */
const customShortcodes = [];

/** @type {{name: string, fn: any}[]} */
const customPairedShortcodes = [];

/** @type {{name: string, factory: any}[]} */
const customTags = [];

/** @type {{createShortcodeTag: Function, createPairedShortcodeTag: Function} | null} */
let shortcodeFactories = null;

/**
 * Get shortcode factories, initializing if needed.
 *
 * @returns {{createShortcodeTag: Function, createPairedShortcodeTag: Function}}
 */
function getShortcodeFactories() {
  if (!shortcodeFactories) {
    shortcodeFactories = createShortcodeFactories({ Tokenizer, evalToken, toPromise });
  }
  return shortcodeFactories;
}

/**
 * Configure Liquid engine options before it's created.
 *
 * @param {Object} options - Configuration options
 * @param {string[]} [options.componentDirs] - Component directories
 * @returns {void}
 */
export function configureLiquid(options) {
  log("Configuring Liquid with options:", options);
  liquidEngineConfig = { ...liquidEngineConfig, ...options };
}

/**
 * Returns the shared Liquid engine (creates it if needed).
 *
 * @param {Object} [options] - Additional Liquid engine options
 * @returns {import("liquidjs").Liquid} The shared Liquid engine instance
 */
export function getLiquidEngine(options = {}) {
  if (!sharedLiquidEngine) {
    createSharedLiquidEngine(options);
  }
  // @ts-expect-error - sharedLiquidEngine is guaranteed to be set by createSharedLiquidEngine
  return sharedLiquidEngine;
}

/**
 * Registers a Liquid component with the CloudCannon component system.
 * Creates a wrapper that renders the Liquid template to an HTMLElement.
 *
 * @param {string} key - Unique identifier for the component
 * @param {string} contents - The Liquid template contents
 * @returns {void}
 */
export function registerLiquidComponent(key, contents) {
  log("Registering component:", key);
  log("Component contents preview:", contents?.substring?.(0, 200) || contents);
  
  const liquidEngine = getLiquidEngine();

  /**
   * Wrapper function that renders the Liquid component to an HTMLElement.
   *
   * @param {Object} props - Props to pass to the Liquid template
   * @returns {Promise<HTMLElement>} The rendered component as an HTMLElement
   */
  const wrappedComponent = async (props) => {
    group(`Rendering component: ${key}`);
    log("Props:", props);
    try {
      log("Parsing and rendering template...");
      const htmlString = await liquidEngine.parseAndRender(contents, props);
      log("Rendered HTML preview:", htmlString?.substring?.(0, 200) || htmlString);
      const rootEl = document.createElement("div");
      rootEl.innerHTML = htmlString;
      groupEnd();
      return rootEl;
    } catch (err) {
      const error = /** @type {Error} */ (err);
      console.error(`Error rendering component ${key}:`, error.message);
      log("Full error:", error);
      const errorEl = document.createElement("div");
      errorEl.innerHTML = `<div style="color: red; padding: 1rem; border: 1px solid red;">Error rendering component: ${error.message}</div>`;
      groupEnd();
      return errorEl;
    }
  };

  window.cc_components = window.cc_components || {};
  window.cc_components[key] = wrappedComponent;
  log("Component registered, dispatching event:", `editable-regions:registered-${key}`);
  document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
}

/**
 * Creates and configures the shared Liquid engine instance.
 *
 * @param {{componentDirs?: string[]}} options - Liquid engine options
 * @returns {void}
 */
function createSharedLiquidEngine(options) {
  // Merge stored config with passed options
  const mergedOptions = { ...liquidEngineConfig, ...options };
  log("Creating shared Liquid engine with options:", mergedOptions);
  
  const fs = createInMemoryFs({
    componentDirs: mergedOptions.componentDirs || ["src/_includes/"]
  });
  log("In-memory filesystem created");
    
  sharedLiquidEngine = new Liquid({
    fs,
    root: ["/"],
    globals: {
      ENV_CLIENT: true
    },
    // Default extension for includes without explicit extension.
    // LiquidJS only supports a single extname - for .html or .bookshop.liquid files,
    // users must specify the full filename: {% include 'header.html' %}
    extname: ".liquid",
    strictFilters: false,
    strictVariables: false,
    ...options
  });
  log("Liquid engine instantiated");
  
  // Register Eleventy's built-in filters
  for (const [name, fn] of Object.entries(eleventyFilters)) {
    sharedLiquidEngine.registerFilter(name, fn);
  }
  log("Registered", Object.keys(eleventyFilters).length, "built-in 11ty filters");
  
  log("Available files in window.cc_files:", Object.keys(window.cc_files || {}));

  const bindIncludeTag = createBindIncludeTag({ Tokenizer, evalToken, toPromise });
  sharedLiquidEngine.registerTag("bind_include", bindIncludeTag(sharedLiquidEngine));
  log("bind_include tag registered");
  
  if (customFilters?.length > 0) {
    for (const { name, fn } of customFilters) {
      sharedLiquidEngine.registerFilter(name, fn);
    }
    log("Registered", customFilters.length, "custom filters");
  }
  
  const { createShortcodeTag, createPairedShortcodeTag } = getShortcodeFactories();
  
  // Register custom shortcodes
  if (customShortcodes?.length > 0) {
    for (const { name, fn } of customShortcodes) {
      sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
    }
    log("Registered", customShortcodes.length, "shortcodes");
  }
  
  // Register custom paired shortcodes
  for (const { name, fn } of customPairedShortcodes) {
    sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
  }
  if (customPairedShortcodes.length > 0) {
    log("Registered", customPairedShortcodes.length, "paired shortcodes");
  }
  
  // Register custom tags
  for (const { name, factory } of customTags) {
    const tagFactory = factory({ Tokenizer, evalToken, toPromise });
    sharedLiquidEngine.registerTag(name, tagFactory(sharedLiquidEngine));
  }
  if (customTags.length > 0) {
    log("Registered", customTags.length, "custom tags");
  }
}

/**
 * Creates a bind_include tag factory for spreading object props into includes.
 * Like Astro's {...props} spread for Liquid includes.
 *
 * Usage: {% bind_include "path/to/partial", objectToSpread %}
 *
 * @param {Object} utils - LiquidJS utilities
 * @param {new (...args: any[]) => any} utils.Tokenizer - LiquidJS Tokenizer class
 * @param {Function} utils.evalToken - Token evaluation function
 * @param {Function} utils.toPromise - Converts generator to promise
 * @returns {Function} Factory that creates the tag implementation
 */
export function createBindIncludeTag({ Tokenizer, evalToken, toPromise }) {
  /**
   * @param {any} liquidEngine - The LiquidJS engine instance
   * @returns {any} Tag implementation with parse and render methods
   */
  const tagFactory = (liquidEngine) => ({
    /**
     * Parses the bind_include tag arguments.
     * @param {any} tagToken - The tag token from LiquidJS parser
     */
    parse(tagToken) {
      log("bind_include parsing tag with args:", tagToken.args);
      const tokenizer = new Tokenizer(tagToken.args, this.liquid.options.operatorsTrie);
      
      this.pathToken = tokenizer.readValue();
      if (!this.pathToken) throw new Error("bind_include: missing path argument");
      log("bind_include parsed path token:", this.pathToken);
      
      tokenizer.skipBlank();
      if (tokenizer.peek() !== ",") throw new Error("bind_include: expected comma separator");
      tokenizer.advance();
      tokenizer.skipBlank();
      
      this.objectToken = tokenizer.readValue();
      if (!this.objectToken) throw new Error("bind_include: missing object argument");
      log("bind_include parsed object token:", this.objectToken);
    },
    
    /**
     * Renders the included template with spread props.
     * @param {any} context - The LiquidJS render context
     */
    async render(context) {
      group("bind_include rendering");
      log("Evaluating path token...");
      const path = await toPromise(evalToken(this.pathToken, context));
      log("Path resolved to:", path);
      
      log("Evaluating object token...");
      const obj = await toPromise(evalToken(this.objectToken, context));
      log("Object resolved to:", obj);
      
      if (!path || typeof path !== "string") {
        groupEnd();
        throw new Error(`bind_include: invalid path "${path}"`);
      }
      if (!obj || typeof obj !== "object") {
        log("Object is not valid, returning empty");
        groupEnd();
        return;
      }
      
      log("Including:", path, "with", Object.keys(obj).length, "props:", Object.keys(obj));
      
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
        throw error;
      } finally {
        context.pop();
      }
    }
  });

  return tagFactory;
}

/**
 * Registers a custom Liquid filter.
 *
 * @param {string} name - The filter name
 * @param {any} fn - The filter function
 * @returns {void}
 */
export function registerCustomFilter(name, fn) {
  log("Registering filter:", name);
  customFilters.push({ name, fn });
  
  if (sharedLiquidEngine) {
    sharedLiquidEngine.registerFilter(name, fn);
  }
}

/**
 * Registers a custom shortcode.
 *
 * Usage in templates: {% shortcodeName arg1, arg2 %}
 *
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {any} fn - The shortcode function (arg1, arg2, ...) => string
 * @returns {void}
 */
export function registerCustomShortcode(name, fn) {
  log("Registering shortcode:", name);
  customShortcodes.push({ name, fn });
  
  if (sharedLiquidEngine) {
    const { createShortcodeTag } = getShortcodeFactories();
    sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
  }
}

/**
 * Registers a custom paired shortcode (with content between tags).
 *
 * Usage in templates: {% shortcodeName arg %}content{% endshortcodeName %}
 *
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {any} fn - The shortcode function (content, arg1, ...) => string
 * @returns {void}
 */
export function registerCustomPairedShortcode(name, fn) {
  log("Registering paired shortcode:", name);
  customPairedShortcodes.push({ name, fn });
  
  if (sharedLiquidEngine) {
    const { createPairedShortcodeTag } = getShortcodeFactories();
    sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
  }
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
 * @param {any} factory - Factory function that receives { Tokenizer, evalToken, toPromise }
 *                             and returns (liquidEngine) => { parse(), render() }
 * @returns {void}
 */
export function registerCustomTag(name, factory) {
  log("Registering custom tag:", name);
  customTags.push({ name, factory });
  
  if (sharedLiquidEngine) {
    const tagFactory = factory({ Tokenizer, evalToken, toPromise });
    sharedLiquidEngine.registerTag(name, tagFactory(sharedLiquidEngine));
  }
}

