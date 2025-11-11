import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { addEditableComponentRenderer } from "../dist/helpers/cloudcannon.js";

/**
 * Registers a React component with the CloudCannon component system.
 * Creates a wrapper that renders the React component to an HTMLElement.
 *
 * @param {string} key - Unique identifier for the component
 * @param {any} component - The React component function to register
 * @returns {void}
 */
export const registerReactComponent = (key, component) => {
	/**
	 * Wrapper function that renders the React component to an HTMLElement.
	 *
	 * @param {any} props - Props to pass to the React component
	 * @returns {HTMLElement} The rendered component as an HTMLElement
	 */
	const wrappedComponent = (props) => {
		const reactNode = createElement(component, props, null);
		const rootEl = document.createElement("div");
		const root = createRoot(rootEl);

		flushSync(() => root.render(reactNode));

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
