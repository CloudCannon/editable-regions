"use client";

import type { ElementType, FC, HTMLAttributes } from "react";
import { createElement, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { addEditableComponentRenderer } from "../helpers/cloudcannon.js";
// Side-effect only: carries the ambient `window` globals into the .d.ts.
import "../helpers/globals.js";

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			"editable-component": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop": string;
					"data-component": string;
				};
			"editable-text": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop": string;
					"data-type"?: "block" | "text" | "span";
				};
			"editable-source": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-path": string;
					"data-key": string;
				};
			"editable-array": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop": string;
					"data-id-key"?: string;
					"data-component-key"?: string;
					"data-component"?: string;
					"data-direction"?:
						| "column"
						| "row"
						| "column-reverse"
						| "row-reverse";
				};
			"editable-array-item": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-id"?: string;
					"data-component"?: string;
				};
			"editable-image": React.RefAttributes<HTMLElement> &
				React.HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop"?: string;
					"data-prop-src"?: string;
					"data-prop-alt"?: string;
					"data-prop-title"?: string;
				};
		}
	}
}

export const registerReactComponent = (
	key: string,
	component: unknown,
): void => {
	const wrappedComponent = (props: any): HTMLElement => {
		const reactNode = createElement(component as ElementType, props, null);
		const rootEl = document.createElement("div");
		const root = createRoot(rootEl);

		flushSync(() => root.render(reactNode));

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};

// Waits for framework hydration before connecting, so regions aren't mutated mid-hydration.
export const EditableRegions: FC<
	HTMLAttributes<HTMLElement> & { tag?: string }
> = ({ tag: Tag = "div", ...attrs }) => {
	const elementRef = useRef<HTMLElement | null>(null);
	const editableRef = useRef<any | null>(null);

	useEffect(() => {
		const connectEditable = (regions: any) => {
			if (!regions || editableRef.current) {
				return;
			}

			editableRef.current = new regions.Editable(elementRef.current);
			editableRef.current.connect();
		};

		const onLoad = () => {
			connectEditable((window as any).editableRegions);
		};

		if ((window as any).editableRegions) {
			connectEditable((window as any).editableRegions);
		} else {
			document.addEventListener("editable-regions:load", onLoad, {
				once: true,
			});
		}

		return () => {
			document.removeEventListener("editable-regions:load", onLoad);
			editableRef.current?.disconnect();
			editableRef.current = null;
		};
	}, []);

	// data-prop and data-literal are controlled here; user-supplied ones are dropped.
	const forwarded: Record<string, any> = {};
	for (const [name, value] of Object.entries(attrs)) {
		if (/^data-(prop|literal)/i.test(name)) {
			continue;
		}

		forwarded[name] = value;
	}

	return createElement(Tag, {
		...forwarded,
		ref: elementRef,
		"data-editable": "_dynamic",
		"data-prop": "",
	});
};
