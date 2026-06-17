import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.browser";

import { addFrameworkRenderer, queueForClientSideRender } from "./index.mjs";

addFrameworkRenderer({
	name: "@astrojs/react",
	clientEntrypoint: "@astrojs/react/client.js",
	ssr: {
		// Handles all remaining components as React.
		check: () => true,
		/**
		 * Renders to static markup, falling back to a client-side render queue.
		 * @param {any} Component
		 * @param {any} props
		 * @returns {Promise<{ html: string }>}
		 */
		renderToStaticMarkup: async (Component, props) => {
			try {
				const reactNode = Component(props);
				return { html: renderToStaticMarkup(reactNode) };
			} catch (_err) {
				const id = queueForClientSideRender((node) => {
					const reactNode = createElement(Component, props, null);
					const root = createRoot(node);
					flushSync(() => root.render(reactNode));
				});
				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}
		},
	},
});
