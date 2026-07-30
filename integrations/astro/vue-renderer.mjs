import { createApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { addFrameworkRenderer, queueForClientSideRender } from "./index.mjs";

addFrameworkRenderer({
	name: "@astrojs/vue",
	clientEntrypoint: "@astrojs/vue/client.js",
	ssr: {
		/**
		 * Checks if the component is a Vue component (object with Vue-specific markers).
		 * @param {any} Component - The component to check
		 * @returns {boolean} True if component looks like a Vue component
		 */
		check: (Component) => {
			return (
				typeof Component === "object" &&
				Component !== null &&
				("render" in Component ||
					"setup" in Component ||
					"template" in Component ||
					"ssrRender" in Component ||
					"__ssrInlineRender" in Component ||
					"__file" in Component)
			);
		},

		/**
		 * Renders to static markup, falling back to a client-side render queue.
		 * @param {any} Component
		 * @param {any} inputProps
		 * @param {Record<string, string>} slotted
		 * @param {any} metadata
		 * @returns {Promise<{ html: string }>}
		 */
		renderToStaticMarkup: async (Component, inputProps, slotted, metadata) => {
			/** @type{Record<string, Function>} */
			const slots = {};
			const props = { ...inputProps };
			delete props.slot;
			for (const [key, value] of Object.entries(slotted)) {
				slots[key] = () => h("astro-static-slot", { innerHTML: value });
			}

			if (metadata?.hydrate) {
				const id = queueForClientSideRender((node) => {
					const app = createApp({ render: () => h(Component, props, slots) });
					app.mount(node);
				});

				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}

			const app = createApp({ render: () => h(Component, props, slots) });
			const html = await renderToString(app);
			return { html };
		},
	},
});
