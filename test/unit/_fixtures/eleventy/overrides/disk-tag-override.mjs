/**
 * Browser override for the `diskTag` custom Liquid tag. Server-side it
 * reads from disk — impossible in the browser. This portable replacement
 * renders a placeholder.
 *
 * @param {any} _liquidEngine
 */
export default function diskTagFactory(_liquidEngine) {
	return {
		/** @param {any} _tagToken */
		parse(_tagToken) {
			// No args needed for the override.
		},
		async render() {
			return "<span data-disk-tag>disk-tag-override</span>";
		},
	};
}
