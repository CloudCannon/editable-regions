/**
 * Shortcode-to-LiquidJS-Tag wrapper utilities.
 * Converts Eleventy-style shortcode functions into LiquidJS custom tags.
 *
 * Eleventy shortcodes: simple functions that return HTML
 * LiquidJS tags: objects with parse() and render() methods
 */

import { log, group, groupEnd } from "./logger.mjs";

/**
 * Creates factory functions for shortcode tags.
 * Must be called with LiquidJS utilities from the browser module.
 *
 * @param {Object} liquidUtils - LiquidJS utilities
 * @param {new (...args: any[]) => any} liquidUtils.Tokenizer - LiquidJS Tokenizer class
 * @param {Function} liquidUtils.evalToken - Token evaluation function
 * @param {Function} liquidUtils.toPromise - Converts generator to promise
 * @returns {{createShortcodeTag: Function, createPairedShortcodeTag: Function}}
 */
export function createShortcodeFactories({ Tokenizer, evalToken, toPromise }) {
  
  /**
   * Parses comma-separated arguments from a tag's args string.
   * Handles quoted strings and variable references.
   *
   * @param {string} argsString - Raw arguments string from tagToken.args
   * @param {Object} operatorsTrie - Liquid options operatorsTrie
   * @returns {any[]} Array of parsed tokens
   */
  function parseArgs(argsString, operatorsTrie) {
    if (!argsString || !argsString.trim()) {
      return [];
    }
    
    const tokenizer = new Tokenizer(argsString, operatorsTrie);
    const tokens = [];
    
    while (true) {
      tokenizer.skipBlank();
      const token = tokenizer.readValue();
      if (!token) break;
      tokens.push(token);
      
      tokenizer.skipBlank();
      if (tokenizer.peek() === ",") {
        tokenizer.advance();
      } else {
        break;
      }
    }
    
    return tokens;
  }
  
  /**
   * Evaluates parsed tokens against the render context.
   *
   * @param {any[]} tokens - Array of parsed tokens
   * @param {Object} context - LiquidJS render context
   * @returns {Promise<any[]>} Array of evaluated values
   */
  async function evaluateArgs(tokens, context) {
    const values = [];
    for (const token of tokens) {
      const value = await toPromise(evalToken(token, context));
      values.push(value);
    }
    return values;
  }
  
  /**
   * Creates a LiquidJS tag implementation for a regular (non-paired) shortcode.
   *
   * Usage: {% shortcodeName arg1, arg2, "literal" %}
   *
   * @param {any} shortcodeFn - The shortcode function (arg1, arg2, ...) => string
   * @param {string} shortcodeName - The shortcode name for logging
   * @returns {Object} LiquidJS tag implementation
   */
  function createShortcodeTag(shortcodeFn, shortcodeName) {
    /** @type {any} */
    const tag = {
      /**
       * @param {any} tagToken - The tag token from LiquidJS parser
       */
      parse(tagToken) {
        this.argTokens = parseArgs(tagToken.args, this.liquid.options.operatorsTrie);
      },
      
      /**
       * @param {any} context - The LiquidJS render context
       */
      async render(context) {
        log("Executing shortcode \"" + shortcodeName + "\"");
        const args = await evaluateArgs(this.argTokens, context);
        log("Shortcode args:", args);
        const result = await shortcodeFn(...args);
        log("Shortcode returned:", result?.substring?.(0, 100) || result);
        return result ?? "";
      }
    };
    return tag;
  }
  
  /**
   * Creates a LiquidJS tag implementation for a paired shortcode.
   *
   * Usage: {% shortcodeName arg1 %}content{% endshortcodeName %}
   *
   * @param {string} tagName - The shortcode/tag name (needed to find end tag)
   * @param {any} shortcodeFn - The shortcode function (content, arg1, ...) => string
   * @returns {Object} LiquidJS tag implementation
   */
  function createPairedShortcodeTag(tagName, shortcodeFn) {
    const endTagName = `end${tagName}`;
    
    /** @type {any} */
    const tag = {
      /**
       * @param {any} tagToken - The tag token from LiquidJS parser
       * @param {any} remainTokens - Remaining tokens to parse
       */
      parse(tagToken, remainTokens) {
        this.argTokens = parseArgs(tagToken.args, this.liquid.options.operatorsTrie);
        this.templates = [];
        
        // Consume tokens until we find the end tag
        while (remainTokens.length) {
          const token = remainTokens.shift();
          
          // Check if this is our end tag
          if (token.name === endTagName) {
            break;
          }
          
          // Parse this token into a template and add to our templates
          const template = this.liquid.parser.parseToken(token, remainTokens);
          this.templates.push(template);
        }
      },
      
      /**
       * @param {any} context - The LiquidJS render context
       */
      async render(context) {
        group("Paired shortcode \"" + tagName + "\"");
        log("Inner templates to render:", this.templates.length);
        
        // Render the content between the tags
        // NOTE: renderTemplates returns a generator, must use toPromise() to resolve it
        const content = await toPromise(this.liquid.renderer.renderTemplates(this.templates, context));
        log("Content resolved:", content);
        
        // Evaluate arguments
        const args = await evaluateArgs(this.argTokens, context);
        log("Args:", args);
        
        // Call shortcode with content as first argument, then other args
        const result = await shortcodeFn(content, ...args);
        log("Final HTML:", result?.substring?.(0, 100) || result);
        groupEnd();
        
        return result ?? "";
      }
    };
    return tag;
  }
  
  return {
    createShortcodeTag,
    createPairedShortcodeTag,
  };
}

