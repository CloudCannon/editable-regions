"use client";

import { createElement, useEffect, useRef } from "react";
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

/**
 * Root editable region component for React (e.g. Next.js App Router pages).
 * Renders a configurable element (default `div`) marked with
 * `data-editable="_dynamic"`, and connects a base editable node to it only
 * once the surrounding React app has mounted, keeping editable regions from
 * mutating the DOM before frameworks like Next.js finish hydrating.
 *
 * The editable node classes are not bundled with this component: in the
 * CloudCannon editor they are exposed as `window.editableRegions` by the
 * editable regions script, which also dispatches `editable-regions:load`
 * when they become available. Outside the editor this component renders
 * its element and does nothing.
 *
 * The element hardcodes an empty `data-prop` so descendant editable regions
 * resolve their relative `data-prop` paths against the current file.
 * User-supplied `data-prop*` and `data-literal*` attributes are ignored.
 *
 * @param {{ tag?: string } & Record<string, any>} props
 * All other props and attributes are forwarded to the rendered element.
 */
export const EditableRegions = ({ tag: Tag = "div", ...attrs }) => {
	const elementRef = useRef(null);
	/** @type {{ current: any | null }} */
	const editableRef = useRef(null);
	/** @type {{ current: boolean }} */
	const hasWarnedRef = useRef(false);

	useEffect(() => {
		/** @param {any} regions */
		const connectEditable = (regions) => {
			if (!regions || editableRef.current) {
				return;
			}

			editableRef.current = new regions.Editable(elementRef.current);
			editableRef.current.connect();
		};

		const onLoad = () => {
			connectEditable(/** @type {any} */ (window).editableRegions);
		};

		if (/** @type {any} */ (window).editableRegions) {
			connectEditable(/** @type {any} */ (window).editableRegions);
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

	/** @type {Record<string, any>} */
	const forwarded = {};
	for (const [name, value] of Object.entries(attrs)) {
		if (/^data-(prop|literal)/i.test(name)) {
			if (!hasWarnedRef.current) {
				hasWarnedRef.current = true;
				console.warn(
					`[EditableRegions] Ignoring the '${name}' attribute: data-prop and data-literal attributes are controlled by the component itself, which resolves the current file's data.`,
				);
			}
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
