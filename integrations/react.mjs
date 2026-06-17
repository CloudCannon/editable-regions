import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { addEditableComponentRenderer } from "../helpers/cloudcannon.mjs";

/**
 * Registers a React component, wrapping it to render to an HTMLElement.
 *
 * @param {string} key
 * @param {any} component
 */
export const registerReactComponent = (key, component) => {
	/**
	 * @param {any} props
	 * @returns {HTMLElement}
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
