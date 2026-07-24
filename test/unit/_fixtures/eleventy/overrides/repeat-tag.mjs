/**
 * Custom Liquid tag factory for `{% diskTag value %}` — server-side it
 * reads from disk (non-portable). Browser override replaces it.
 */
import { Tokenizer } from "liquidjs";

export default function repeatTagFactory(_liquidEngine) {
	return {
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
