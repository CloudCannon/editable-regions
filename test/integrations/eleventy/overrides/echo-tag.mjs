/**
 * Custom Liquid tag factory for `{% echo value %}` — renders `value`
 * (evaluated against the render context) inside a `<span data-echo>` wrapper.
 *
 * Same module is consumed twice:
 *   - server-side via `eleventyConfig.addLiquidTag("echo", echoTagFactory)`
 *   - browser-side via `pluginOptions.liquid.tags = { echo: "./overrides/echo-tag.mjs" }`
 *
 * The browser bundle imports the default export and registers it through
 * `registerCustomTag`, so the factory signature has to match what LiquidJS
 * expects: `(engine) => { parse, render }`.
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
