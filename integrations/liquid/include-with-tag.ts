// Kept in its own file so the Node-side Eleventy plugin can import it without browser-runtime modules.

import type { Liquid } from "liquidjs";
import { evalToken, Tokenizer, toPromise } from "liquidjs";
import { enhanceLiquidError } from "./errors.js";
import { group, groupEnd, log } from "./logger.js";
import type { LiquidTagImpl } from "./tag-types.js";

export function createIncludeWithTag(_liquidEngine: Liquid): LiquidTagImpl {
	return {
		parse(tagToken) {
			const tokenizer = new Tokenizer(
				tagToken.args,
				this.liquid.options.operators,
			);

			this.pathToken = tokenizer.readValue();
			if (!this.pathToken) {
				throw new Error("includeWith: missing path argument");
			}

			tokenizer.skipBlank();
			if (tokenizer.peek() !== ",") {
				throw new Error("includeWith: expected comma separator");
			}
			tokenizer.advance();
			tokenizer.skipBlank();

			this.objectToken = tokenizer.readValue();
			if (!this.objectToken) {
				throw new Error("includeWith: missing object argument");
			}
		},

		async render(context) {
			group("includeWith rendering");
			const path = await toPromise(evalToken(this.pathToken, context));
			log("Path resolved to:", path);

			const obj = await toPromise(evalToken(this.objectToken, context));
			log("Object resolved to:", obj);

			if (!path || typeof path !== "string") {
				groupEnd();
				throw new Error(`includeWith: invalid path "${path}"`);
			}
			if (!obj || typeof obj !== "object") {
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
				const templates = await this.liquid.parseFile(path);
				const result = await this.liquid.render(templates, context);
				log("Rendered result preview:", result?.substring?.(0, 200) || result);
				groupEnd();
				return result;
			} catch (err) {
				const error = err as Error;
				log("Error during render:", error.message);
				groupEnd();
				throw enhanceLiquidError(err, `includeWith "${path}"`);
			} finally {
				context.pop();
			}
		},
	};
}
