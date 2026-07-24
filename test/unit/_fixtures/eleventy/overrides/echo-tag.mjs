/**
 * Custom Liquid tag factory for `{% echo value %}` — renders `value`
 * (evaluated against the render context) inside a `<span data-echo>` wrapper.
 * Auto-mirrors from the config (no override needed).
 */
import { evalToken, Tokenizer, toPromise } from "liquidjs";

export default function echoTagFactory(_liquidEngine) {
	return {
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
		async render(context) {
			const value = await toPromise(evalToken(this.valueToken, context));
			return `<span data-echo>${value}</span>`;
		},
	};
}
