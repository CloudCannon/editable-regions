import { createApp, h } from "vue";
import { addEditableComponentRenderer } from "../helpers/cloudcannon.mjs";

/**
 * Registers a Vue component with the CloudCannon component system.
 * Creates a wrapper that renders the Vue component to an HTMLElement.
 *
 * @param {string} key - Unique identifier for the component
 * @param {any} component - The Vue component to register
 * @returns {void}
 */
export const registerVueComponent = (key, component) => {
	/**
	 * Wrapper function that renders the Vue component to an HTMLElement.
	 *
	 * @param {any} props - Props to pass to the Vue component
	 * @returns {HTMLElement} The rendered component as an HTMLElement
	 */
	const wrappedComponent = (props) => {
		const rootEl = document.createElement("div");
		const app = createApp({ render: () => h(component, props) });
		app.mount(rootEl);

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
