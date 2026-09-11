/**
 * Custom Liquid tag factory for `{% diskTag value %}` — server-side it
 * reads from disk (non-portable). Browser override replaces it.
 */
import { Tokenizer } from "liquidjs";

/** @param {any} _liquidEngine */
export default function repeatTagFactory(_liquidEngine) {
	return {
		/** @this {any} @param {any} tagToken */
		parse(tagToken) {
			const tokenizer = new Tokenizer(
				tagToken.args,
				this.liquid.options.operatorsTrie,
			);
			this.valueToken = tokenizer.readValue();
		},
		async render() {
			return `<span data-disk-tag>disk-tag-server</span>`;
		},
	};
}
