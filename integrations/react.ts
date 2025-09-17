import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { editableComponentRenderers } from "../helpers/cloudcannon";

export const registerReactComponent = (
	key: string,
	component: unknown,
): void => {
	const wrappedComponent = (props: any): HTMLElement => {
		const reactNode = createElement(component as any, props, null);
		const rootEl = document.createElement("div");
		const root = createRoot(rootEl);

		flushSync(() => root.render(reactNode));

		return rootEl;
	};

	editableComponentRenderers[key] = wrappedComponent;
};
