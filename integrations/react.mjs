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
 * Keeps editable regions from mutating the DOM before frameworks like Next.js finish hydrating.
 *
 * @param {{ tag?: string } & Record<string, any>} props
 * All other props and attributes are forwarded to the rendered element.
 */
export const EditableRegions = ({ tag: Tag = "div", ...attrs }) => {
	const elementRef = useRef(null);
	/** @type {{ current: any | null }} */
	const editableRef = useRef(null);

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
