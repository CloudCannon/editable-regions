/**
 * Custom Liquid tag factory for `{% echo value %}` — renders `value`
 * (evaluated against the render context) inside a `<span data-echo>` wrapper.
 *
 * Registered server-side via `eleventyConfig.addLiquidTag("echo", echoTagFactory)`.
 * The browser side auto-mirrors it: the config (and this module with it) is
 * bundled and replayed, so `{% echo %}` is available in live editing with no
 * override. The factory signature has to match what LiquidJS expects:
 * `(engine) => { parse, render }`.
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
