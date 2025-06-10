import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { WindowType } from "../types/window.js";

declare const window: WindowType;

export const registerReactComponent = (
	key: string,
	component: unknown,
): void => {
	const wrappedComponent = (target: HTMLElement, props: any): void => {
		const reactNode = createElement(component as any, props, null);
		const rootEl = document.createElement("div");
		const root = createRoot(rootEl);

		flushSync(() => root.render(reactNode));

		const child = rootEl.firstElementChild;
		if (
			child?.tagName === "LIVE-COMPONENT" &&
			child.getAttribute("component") === key
		) {
			(child as any).value = (target as any).value;
			target.replaceWith(child);
		} else {
			let targetChild: ChildNode | null | undefined =
				target.firstChild ?? undefined;
			let renderChild: ChildNode | null | undefined =
				rootEl.firstChild ?? undefined;
			while (renderChild || targetChild) {
				if (renderChild && targetChild) {
					targetChild.replaceWith(renderChild);
				} else if (renderChild) {
					target.appendChild(renderChild);
				} else if (targetChild) {
					target.removeChild(targetChild);
				}

				targetChild = targetChild?.nextSibling ?? undefined;
				renderChild = renderChild?.nextSibling ?? undefined;
			}
		}
	};

	window.cc_components ??= {};
	window.cc_components[key] = wrappedComponent;
};
