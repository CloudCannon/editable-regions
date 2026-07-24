/** biome-ignore-all lint/suspicious/noPrototypeBuiltins: Matches the behaviour of @astrojs/react */
import ssr from "@astrojs/react/server.js";
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { addFrameworkRenderer, queueForClientSideRender } from "./index.mjs";

/**
 * @param {string} str
 * @returns {string}
 */
const slotName = (str) =>
	str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
const reactTypeof = Symbol.for("react.element");
const reactTransitionalTypeof = Symbol.for("react.transitional.element");

addFrameworkRenderer({
	name: "@astrojs/react",
	clientEntrypoint: "@astrojs/react/client.js",
	ssr: {
		/**
		 * @param {any} Component
		 * @param {any} props
		 * @param {Record<string, string>} children
		 * @returns {Promise<boolean>}
		 */
		check: async (Component, props, children) => {
			if (typeof Component === "object") {
				return !!Component.$$typeof
					?.toString()
					.slice("Symbol(".length)
					.startsWith("react");
			}
			if (typeof Component !== "function") return false;
			if (Component.name === "QwikComponent") return false;

			if (
				typeof Component === "function" &&
				Component.$$typeof === Symbol.for("react.forward_ref")
			)
				return false;

			if (
				Component.prototype != null &&
				typeof Component.prototype.render === "function"
			) {
				return (
					React.Component.isPrototypeOf(Component) ||
					React.PureComponent.isPrototypeOf(Component)
				);
			}

			let isReactComponent = false;
			/** @param  {...any} args */
			function Tester(...args) {
				try {
					const vnode = Component(...args);
					if (
						vnode &&
						(vnode.$$typeof === reactTypeof ||
							vnode.$$typeof === reactTransitionalTypeof)
					) {
						isReactComponent = true;
					}
				} catch {}

				return React.createElement("div");
			}

			await ssr.renderToStaticMarkup.call(this, Tester, props, children);

			return isReactComponent;
		},
		/**
		 * Renders to static markup, falling back to a client-side render queue.
		 * @param {any} Component
		 * @param {any} props
		 * @param {Record<string, string>} inputSlotted
		 * @param {any} metadata
		 * @returns {Promise<{ html: string }>}
		 */
		renderToStaticMarkup: async (Component, props, inputSlotted, metadata) => {
			if (metadata?.hydrate) {
				const { default: children, ...slotted } = inputSlotted;
				/** @type{Record<string, React.ReactNode>} */
				const slots = {};
				for (const [key, value] of Object.entries(slotted)) {
					const name = slotName(key);
					slots[name] = React.createElement("astro-static-slot", {
						suppressHydrationWarning: true,
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Intentionally rendering static html
						dangerouslySetInnerHTML: { __html: value },
					});
				}

				const newProps = {
					...props,
					...slots,
				};
				const newChildren = children ?? props.children;
				if (newChildren != null) {
					newProps.children = React.createElement("astro-static-slot", {
						suppressHydrationWarning: true,
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Intentionally rendering static html
						dangerouslySetInnerHTML: { __html: newChildren },
					});
				}

				const id = queueForClientSideRender((node) => {
					const reactNode = React.createElement(Component, newProps);
					const root = createRoot(node);
					flushSync(() => root.render(reactNode));
				});

				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}

			return ssr.renderToStaticMarkup.call(
				this,
				Component,
				props,
				inputSlotted,
				{ ...metadata, astroStaticSlot: true, hydrate: false },
			);
		},
	},
});
