/**
 * Custom Liquid tag factory for `{% echo value %}` — renders `value`
 * (evaluated against the render context) inside a `<span data-echo>` wrapper.
 * Auto-mirrors from the config (no override needed).
 */
import { evalToken, Tokenizer, toPromise } from "liquidjs";

/** @param {any} _liquidEngine */
export default function echoTagFactory(_liquidEngine) {
	return {
		/** @this {any} @param {any} tagToken */
		parse(tagToken) {
			const tokenizer = new Tokenizer(
				tagToken.args,
				this.liquid.options.operatorsTrie,
			);
			this.valueToken = tokenizer.readValue();
			if (!this.valueToken) {
				throw new Error("echo: missing value argument");
			}
		},
		/** @this {any} @param {any} context */
		async render(context) {
			const value = await toPromise(evalToken(this.valueToken, context));
			return `<span data-echo>${value}</span>`;
		},
	};
}
