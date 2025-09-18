import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.browser";

import { addFrameworkRenderer, queueForClientSideRender } from "./index.mjs";

addFrameworkRenderer({
	name: "@astrojs/react",
	clientEntrypoint: "@astrojs/react/client.js",
	ssr: {
		/**
		 * Always returns true to handle all remaining components as React.
		 * @returns {boolean} Always true
		 */
		check: () => true,
		/**
		 * Renders a React component to static markup or queues for client-side rendering.
		 * @param {any} Component - The React component function
		 * @param {any} props - Props to pass to the component
		 * @returns {Promise<{ html: string }>} Object containing the rendered HTML
		 */
		renderToStaticMarkup: async (Component, props) => {
			try {
				const reactNode = Component(props);
				return { html: renderToStaticMarkup(reactNode) };
			} catch (err) {
				const id = queueForClientSideRender((node) => {
					const reactNode = createElement(Component, props, null);
					const root = createRoot(node);
					flushSync(() => root.render(reactNode));
				});
				// Queue for client-side rendering if SSR fails
				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}
		},
	},
});
