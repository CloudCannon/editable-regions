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
		 * @param {any} Component
		 * @returns {boolean}
		 */
		check: (Component) => {
			if (typeof Component !== "function") return false;

			// React class components have render on the prototype
			if (typeof Component.prototype?.render === "function") return true;

			// React functional components return vnodes with $$typeof
			try {
				const vnode = Component({});
				return (
					vnode != null && typeof vnode === "object" && "$$typeof" in vnode
				);
			} catch {
				return false;
			}
		},
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
			} catch (_err) {
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
