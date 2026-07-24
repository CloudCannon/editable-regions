import { createRawSnippet } from "svelte";
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
		 * Renders to static markup, falling back to a client-side render queue.
		 * @param {any} Component
		 * @param {any} props
		 * @param {Record<string, string>} slots
		 * @param {any} metadata
		 * @returns {Promise<{ html: string }>}
		 */
		renderToStaticMarkup: async (Component, props, slots, metadata) => {
			/** @type{Record<string, any>} */
			const renderProps = {};
			/** @type{Record<string, any> | undefined} */
			let $$slots;
			/** @type{import("svelte").Snippet | undefined} */
			let children;
			for (const [key, value] of Object.entries(slots)) {
				$$slots ??= {};
				if (key === "default") {
					$$slots.default = true;
					children = createRawSnippet(() => ({
						render: () => value,
					}));
				} else {
					$$slots[key] = createRawSnippet(() => ({
						render: () => value,
					}));
				}
				const slotName = key === "default" ? "children" : key;
				renderProps[slotName] = createRawSnippet(() => ({
					render: () => value,
				}));
			}

			const newProps = {
				...props,
				children,
				$$slots,
				...renderProps,
			};

			if (metadata?.hydrate) {
				const id = queueForClientSideRender((node) => {
					if (mount) {
						mount(Component, {
							target: /** @type{any}*/ (node),
							props: newProps,
						});
					} else {
						new Component({
							target: node,
							props: newProps,
						});
					}

					flushSync();
				});

				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}

			const doc = document.implementation.createHTMLDocument();
			if (mount) {
				mount(Component, {
					target: /** @type{any}*/ (doc.body),
					props: newProps,
				});
			} else {
				new Component({
					target: doc.body,
					props: newProps,
				});
			}

			flushSync();

			return { html: doc.body.innerHTML };
		},
	},
});
