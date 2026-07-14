import { addFrameworkRenderer, queueForClientSideRender } from "./index.mjs";

/** @type{((component: any, args: { target: HTMLElement, props: unknown }) => void) | undefined} */
let mount;
/** @type{() => void} */
let flushSync;
try {
	({ mount, flushSync } = await import("svelte"));
} catch {
	// Svelte 4 — no mount export
}

addFrameworkRenderer({
	name: "@astrojs/svelte",
	clientEntrypoint: "@astrojs/svelte/client.js",
	ssr: {
		/**
		 * @param {any} Component
		 * @returns {boolean}
		 */
		check: (Component) => {
			if (typeof Component !== "function") return false;

			// Svelte 5: compiled components reference $$payload or $$renderer
			const str = Component.toString();
			if (
				str.includes("$$payload") ||
				str.includes("$$renderer") ||
				str.includes("$$anchor")
			) {
				return true;
			}

			// Svelte 4: class-based components have a render static method
			if (typeof Component.render === "function") {
				return true;
			}

			return false;
		},
		/**
		 * @param {any} Component
		 * @param {unknown} props
		 * @returns {Promise<{html: string}>}
		 */
		renderToStaticMarkup: async (Component, props) => {
			const id = queueForClientSideRender((node) => {
				if (mount) {
					mount(Component, {
						target: /** @type{any}*/ (node),
						props,
					});
				} else {
					new Component({ target: node, props });
				}

				flushSync();
			});

			return {
				html: `<div data-editable-region-csr-id=${id}></div>`,
			};
		},
	},
});
