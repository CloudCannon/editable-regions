import "../../helpers/globals.js";
import { createApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { addFrameworkRenderer, queueForClientSideRender } from "./index.js";

addFrameworkRenderer({
	name: "@astrojs/vue",
	clientEntrypoint: "@astrojs/vue/client.js",
	ssr: {
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

		renderToStaticMarkup: async (
			Component,
			inputProps,
			slotted,
			metadata,
		): Promise<{ html: string }> => {
			const slots: Record<string, () => any> = {};
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
