import type { TagToken } from "liquidjs";
import { evalToken, Tokenizer, toPromise } from "liquidjs";
import type { TagImplOptions } from "liquidjs/dist/template/tag-options-adapter";
import { group, groupEnd, log } from "./logger.js";

export function createShortcodeTag(
	shortcodeName: string,
	shortcodeFn: (...args: any[]) => any,
): TagImplOptions {
	const tag: TagImplOptions = {
		parse(tagToken) {
			this.argTokens = parseArgs(
				tagToken.args,
				(this.liquid.options as any).operatorsTrie,
			);
		},

		async render(context) {
			const args = await evaluateArgs(this.argTokens, context);
			log(`Shortcode "${shortcodeName}" args:`, args);
			const result = await shortcodeFn(...args);
			log("Shortcode returned:", result?.substring?.(0, 100) || result);
			return result ?? "";
		},
	};
	return tag;
}

export function createPairedShortcodeTag(
	tagName: string,
	shortcodeFn: (...args: any[]) => any,
): TagImplOptions {
	const endTagName = `end${tagName}`;

	const tag: TagImplOptions = {
		parse(tagToken, remainTokens) {
			this.argTokens = parseArgs(
				tagToken.args,
				(this.liquid.options as any).operatorsTrie,
			);
			this.templates = [];

			while (remainTokens.length) {
				const token = remainTokens.shift();
				if (!token) break;
				if ((token as TagToken).name === endTagName) break;
				const template = this.liquid.parser.parseToken(token, remainTokens);
				this.templates.push(template);
			}
		},

		async render(context) {
			group(`Paired shortcode "${tagName}"`);

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

export function parseArgs(argsString: string, operatorsTrie: any): any[] {
	if (!argsString?.trim()) {
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

export async function evaluateArgs(
	tokens: any[],
	context: any,
): Promise<any[]> {
	const values = [];
	for (const token of tokens) {
		const value = await toPromise(evalToken(token, context));
		values.push(value);
	}
	return values;
}
