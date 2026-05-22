/**
 * Shortcode-to-LiquidJS-Tag wrapper utilities.
 * Converts Eleventy-style shortcode functions into LiquidJS custom tags.
 *
 * Eleventy shortcodes: simple functions that return HTML
 * LiquidJS tags: objects with parse() and render() methods
 */

import { evalToken, Tokenizer, toPromise } from "liquidjs";
import { group, groupEnd, log } from "./logger.mjs";

/**
 * Creates a LiquidJS tag implementation for a regular (non-paired) shortcode.
 *
 * Usage: {% shortcodeName arg1, arg2, "literal" %}
 *
 * @param {string} shortcodeName
 * @param {any} shortcodeFn - (arg1, arg2, ...) => string
 * @returns {import('liquidjs/dist/template/tag-options-adapter').TagImplOptions}
 */
export function createShortcodeTag(shortcodeName, shortcodeFn) {
  /** @type {any} */
  const tag = {
    parse(/** @type {any} */ tagToken) {
      this.argTokens = parseArgs(
        tagToken.args,
        this.liquid.options.operatorsTrie,
      );
    },

    async render(/** @type {any} */ context) {
      log(`Executing shortcode "${shortcodeName}"`);
      const args = await evaluateArgs(this.argTokens, context);
      log("Shortcode args:", args);
      const result = await shortcodeFn(...args);
      log("Shortcode returned:", result?.substring?.(0, 100) || result);
      return result ?? "";
    },
  };
  return tag;
}

/**
 * Creates a LiquidJS tag implementation for a paired shortcode.
 *
 * Usage: {% shortcodeName arg1 %}content{% endshortcodeName %}
 *
 * @param {string} tagName
 * @param {any} shortcodeFn - (content, arg1, ...) => string
 * @returns {import('liquidjs/dist/template/tag-options-adapter').TagImplOptions}
 */
export function createPairedShortcodeTag(tagName, shortcodeFn) {
  const endTagName = `end${tagName}`;

  /** @type {any} */
  const tag = {
    parse(/** @type {any} */ tagToken, /** @type {any} */ remainTokens) {
      this.argTokens = parseArgs(
        tagToken.args,
        this.liquid.options.operatorsTrie,
      );
      this.templates = [];

      while (remainTokens.length) {
        const token = remainTokens.shift();
        if (token.name === endTagName) break;
        const template = this.liquid.parser.parseToken(token, remainTokens);
        this.templates.push(template);
      }
    },

    async render(/** @type {any} */ context) {
      group(`Paired shortcode "${tagName}"`);
      log("Inner templates to render:", this.templates.length);

      // renderTemplates returns a generator — toPromise resolves it.
      const content = await toPromise(
        this.liquid.renderer.renderTemplates(this.templates, context),
      );
      log("Content resolved:", content);

      const args = await evaluateArgs(this.argTokens, context);
      log("Args:", args);

      const result = await shortcodeFn(content, ...args);
      log("Final HTML:", result?.substring?.(0, 100) || result);
      groupEnd();

      return result ?? "";
    },
  };
  return tag;
}

/**
 * Parses comma-separated arguments from a tag's args string. Handles quoted
 * strings and variable references.
 *
 * @param {string} argsString
 * @param {any} operatorsTrie
 * @returns {any[]}
 */
export function parseArgs(argsString, operatorsTrie) {
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
 * @param {any[]} tokens
 * @param {any} context
 * @returns {Promise<any[]>}
 */
export async function evaluateArgs(tokens, context) {
  const values = [];
  for (const token of tokens) {
    const value = await toPromise(evalToken(token, context));
    values.push(value);
  }
  return values;
}
