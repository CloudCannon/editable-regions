/**
 * `includeWith` tag — spreads an object into a Liquid `{% include %}` the way
 * Astro's `{...props}` does. Lives in its own file (rather than alongside
 * the rest of `index.mjs`) so the Node-side Eleventy plugin can import it
 * at config-load time without transitively pulling in browser-runtime
 * modules (`globals.mjs`, `helpers/cloudcannon.mjs`).
 */

import { evalToken, Tokenizer, toPromise } from "liquidjs";
import { enhanceLiquidError } from "./errors.mjs";
import { group, groupEnd, log } from "./logger.mjs";

/**
 * Creates an includeWith tag for spreading object props into includes.
 * Like Astro's {...props} spread for Liquid includes.
 *
 * Usage: {% includeWith "path/to/partial", objectToSpread %}
 *
 * @param {any} _liquidEngine - Unused; engine reached via `this.liquid`
 * @returns {any}
 */
export function createIncludeWithTag(_liquidEngine) {
  return {
    parse(/** @type {any} */ tagToken) {
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

    async render(/** @type {any} */ context) {
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
