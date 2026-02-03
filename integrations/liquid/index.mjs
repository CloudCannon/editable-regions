// @ts-nocheck
import { Liquid, Tokenizer, evalToken, toPromise } from "liquidjs";
import { createInMemoryFs } from "./fs.mjs";
import { createShortcodeFactories } from "./shortcodes.mjs";
import { log, group, groupEnd } from './logger.mjs';
import { eleventyFilters } from "./11ty-filters.mjs";

// Re-export logger utilities for external use
export { setVerbose, log, group, groupEnd } from './logger.mjs';

let sharedLiquidEngine = null;
let liquidEngineConfig = {};
const customFilters = [];
const customShortcodes = [];
const customPairedShortcodes = [];
const customTags = [];

/** Configure Liquid engine options before it's created */
export function configureLiquid(options) {
  log('Configuring Liquid with options:', options);
  liquidEngineConfig = { ...liquidEngineConfig, ...options };
}

/** Returns the shared Liquid engine (creates it if needed) */
export function getLiquidEngine(options = {}) {
  if (!sharedLiquidEngine) {
    createSharedLiquidEngine(options);
  }
  return sharedLiquidEngine;
}

export function registerLiquidComponent(key, contents){
  log('Registering component:', key);
  log('Component contents preview:', contents?.substring?.(0, 200) || contents);
  
  const liquidEngine = getLiquidEngine();

  const wrappedComponent = async (props) => {
    group(`Rendering component: ${key}`);
    log('Props:', props);
    try {
      log('Parsing and rendering template...');
      const htmlString = await liquidEngine.parseAndRender(contents, props);
      log('Rendered HTML preview:', htmlString?.substring?.(0, 200) || htmlString);
      const rootEl = document.createElement("div");
      rootEl.innerHTML = htmlString;
      groupEnd();
      return rootEl;
    } catch (error) {
      console.error(`Error rendering component ${key}:`, error.message);
      log('Full error:', error);
      const errorEl = document.createElement("div");
      errorEl.innerHTML = `<div style="color: red; padding: 1rem; border: 1px solid red;">Error rendering component: ${error.message}</div>`;
      groupEnd();
      return errorEl;
    }
  };

  window.cc_components = window.cc_components || {};
  window.cc_components[key] = wrappedComponent;
  log('Component registered, dispatching event:', `editable-regions:registered-${key}`);
  document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
}

function createSharedLiquidEngine(options){
  // Merge stored config with passed options
  const mergedOptions = { ...liquidEngineConfig, ...options };
  log('Creating shared Liquid engine with options:', mergedOptions);
  
  const fs = createInMemoryFs({
    baseIncludesDir: mergedOptions.baseIncludesDir || 'src/_includes/'
  });
  log('In-memory filesystem created');
    
  sharedLiquidEngine = new Liquid({
    fs,
    root: ['/'],
    globals: {
      ENV_CLIENT: true
    },
    extname: '.liquid',
    strictFilters: false,
    strictVariables: false,
    ...options
  });
  log('Liquid engine instantiated');
  
  // Register Eleventy's built-in filters
  for (const [name, fn] of Object.entries(eleventyFilters)) {
    sharedLiquidEngine.registerFilter(name, fn);
  }
  log('Registered', Object.keys(eleventyFilters).length, 'built-in 11ty filters');
  
  log('Available files in window.cc_files:', Object.keys(window.cc_files || {}));

  const spreadIncludeTag = createSpreadIncludeTag({ Tokenizer, evalToken, toPromise });
  sharedLiquidEngine.registerTag('spreadInclude', spreadIncludeTag(sharedLiquidEngine));
  log('spreadInclude tag registered');
  
  if (customFilters?.length > 0) {
    for (const { name, fn } of customFilters) {
      sharedLiquidEngine.registerFilter(name, fn);
    }
    log('Registered', customFilters.length, 'custom filters');
  }
  const { createShortcodeTag, createPairedShortcodeTag } = createShortcodeFactories({ Tokenizer, evalToken, toPromise });
  // Register custom shortcodes
  if (customShortcodes?.length > 0) {
    for (const { name, fn } of customShortcodes) {
      sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
    }
    log('Registered', customShortcodes.length, 'shortcodes');
  }
  
  // Register custom paired shortcodes
  for (const { name, fn } of customPairedShortcodes) {
    sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
  }
  if (customPairedShortcodes.length > 0) {
    log('Registered', customPairedShortcodes.length, 'paired shortcodes');
  }
  
  // Register custom tags
  for (const { name, factory } of customTags) {
    const tagFactory = factory({ Tokenizer, evalToken, toPromise });
    sharedLiquidEngine.registerTag(name, tagFactory(sharedLiquidEngine));
  }
  if (customTags.length > 0) {
    log('Registered', customTags.length, 'custom tags');
  }
}

/**
 * spreadInclude - Like Astro's {...props} spread for Liquid includes.
 * Usage: {% spreadInclude "path/to/partial", objectToSpread %}
 */
export function createSpreadIncludeTag({ Tokenizer, evalToken, toPromise }) {
  return (liquidEngine) => ({
    parse(tagToken) {
      log('spreadInclude parsing tag with args:', tagToken.args);
      const tokenizer = new Tokenizer(tagToken.args, this.liquid.options.operatorsTrie);
      
      this.pathToken = tokenizer.readValue();
      if (!this.pathToken) throw new Error('spreadInclude: missing path argument');
      log('spreadInclude parsed path token:', this.pathToken);
      
      tokenizer.skipBlank();
      if (tokenizer.peek() !== ',') throw new Error('spreadInclude: expected comma separator');
      tokenizer.advance();
      tokenizer.skipBlank();
      
      this.objectToken = tokenizer.readValue();
      if (!this.objectToken) throw new Error('spreadInclude: missing object argument');
      log('spreadInclude parsed object token:', this.objectToken);
    },
    
    async render(context) {
      group('spreadInclude rendering');
      log('Evaluating path token...');
      const path = await toPromise(evalToken(this.pathToken, context));
      log('Path resolved to:', path);
      
      log('Evaluating object token...');
      const obj = await toPromise(evalToken(this.objectToken, context));
      log('Object resolved to:', obj);
      
      if (!path || typeof path !== 'string') {
        groupEnd();
        throw new Error(`spreadInclude: invalid path "${path}"`);
      }
      if (!obj || typeof obj !== 'object') {
        log('Object is not valid, returning empty');
        groupEnd();
        return;
      }
      
      log('Including:', path, 'with', Object.keys(obj).length, 'props:', Object.keys(obj));
      
      context.push(obj);
      try {
        log('Parsing file:', path);
        const templates = await this.liquid.parseFile(path);
        log('File parsed, template count:', templates?.length || 0);
        
        log('Rendering templates...');
        const result = await this.liquid.render(templates, context);
        log('Rendered result preview:', result?.substring?.(0, 200) || result);
        groupEnd();
        return result;
      } catch (error) {
        log('Error during render:', error.message);
        log('Full error:', error);
        groupEnd();
        throw error;
      } finally {
        context.pop();
      }
    }
  });
}

export function registerCustomFilter(name, fn) {
  log('Registering filter:', name);
  customFilters.push({ name, fn });
  
  if (sharedLiquidEngine) {
    sharedLiquidEngine.registerFilter(name, fn);
  }
}

/**
 * 
 * Usage in templates: {% shortcodeName arg1, arg2 %}
 * 
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {Function} fn - The shortcode function (arg1, arg2, ...) => string
 */
export function registerCustomShortcode(name, fn) {
  log('Registering shortcode:', name);
  customShortcodes.push({ name, fn });
  
  if (sharedLiquidEngine) {
    sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
  }
}

/**
 * Usage in templates: {% shortcodeName arg %}content{% endshortcodeName %}
 * 
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {Function} fn - The shortcode function (content, arg1, ...) => string
 */
export function registerCustomPairedShortcode(name, fn) {
  log('Registering paired shortcode:', name);
  customPairedShortcodes.push({ name, fn });
  
  if (sharedLiquidEngine) {
    sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
  }
}

/**
 * Usage in templates: {% tagName args %}
 * 
 * Custom tags are more powerful than shortcodes - they receive full access to
 * the LiquidJS parser and can implement complex parsing/rendering logic.
 * 
 * @param {string} name - The tag name
 * @param {Function} factory - Factory function that receives { Tokenizer, evalToken, toPromise }
 *                             and returns (liquidEngine) => { parse(), render() }
 */
export function registerCustomTag(name, factory) {
  log('Registering custom tag:', name);
  customTags.push({ name, factory });
  
  if (sharedLiquidEngine) {
    const tagFactory = factory({ Tokenizer, evalToken, toPromise });
    sharedLiquidEngine.registerTag(name, tagFactory(sharedLiquidEngine));
  }
}

