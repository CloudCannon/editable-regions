import {
	renderSlotToString,
	renderToString,
} from "astro/runtime/server/index.js";
import { addEditableComponentRenderer } from "../../helpers/cloudcannon.mjs";

/** @type {((node: Element) => void)[]} */
const renderRoots = [];

const renderers = [
	{
		name: "dynamic-tags",
		ssr: {
			/** @param {any} Component */
			check: (Component) => {
				return typeof Component === "string";
			},
			/**
			 * @param {string} Component - HTML tag name
			 * @param {Record<string, any>} props
			 * @param {Record<string, string>} slots
			 */
			renderToStaticMarkup: async (Component, props, slots) => {
				const propsString = Object.entries(props)
					.map(([key, value]) => `${key}="${value}"`)
					.join(" ");
				return `<${Component} ${propsString}>${
					slots.default ?? ""
				}</${Component}>`;
			},
		},
	},
];

/**
 * @param {*} renderer
 */
export const addFrameworkRenderer = (renderer) => {
	renderers.push(renderer);
};

/**
 * @param {(node: Element) => void} renderFunction
 */
export const queueForClientSideRender = (renderFunction) => {
	renderRoots.push(renderFunction);
	return renderRoots.length - 1;
};

/**
 * Registers an Astro component, wrapping it to render via Astro SSR with
 * React hydration support.
 *
 * @param {string} key
 * @param {unknown} component
 */
export const registerAstroComponent = (key, component) => {
	/**
	 * @param {any} props
	 * @returns {Promise<HTMLElement>}
	 */
	const wrappedComponent = async (props) => {
		/** @type {CryptoKey | undefined} Encryption key for Astro server islands */
		let encryptionKey;
		try {
			encryptionKey = await window.crypto.subtle.generateKey(
				{
					name: "AES-GCM",
					length: 256,
				},
				true,
				["encrypt", "decrypt"],
			);
		} catch (_err) {
			console.warn(
				"[CloudCannon] Could not generate a key for Astro component. This may cause issues with Astro components that use server-islands",
			);
		}

		const SSRResult = {
			styles: new Set(),
			scripts: new Set(),
			links: new Set(),
			propagation: new Map(),
			propagators: new Map(),
			inlinedScripts: new Map(),
			serverIslandNameMap: { get: () => "EditableRegions" },
			key: encryptionKey,
			base: "/",
			extraHead: [],
			compressHTML: false,
			partial: false,
			shouldInjectCspMetaTags: false,
			componentMetadata: new Map(),
			renderers,
			_metadata: {
				renderers,
				hasHydrationScript: false,
				hasRenderedHead: true,
				hasRenderedServerIslandRuntime: true,
				hasDirectives: new Set(),
				propagators: new Set(),
				rendererSpecificHydrationScripts: new Set(),
				renderedScripts: new Set(),
				extraHead: [],
				extraStyleHashes: [],
				extraScriptHashes: [],
			},
			clientDirectives: new Map([
				["load", "editable-region-placeholder"],
				["idle", "editable-region-placeholder"],
				["visible", "editable-region-placeholder"],
				["media", "editable-region-placeholder"],
			]),
			slots: {},
			props,
			resolve: () => "editable-region-placeholder",
			/** @param {*} args */
			createAstro(...args) {
				if (args.length < 2 || args.length > 3) {
					console.warn(
						`[CloudCannon] createAstro called with unexpected number of arguments (${args.length})`,
					);
				}

				let astroGlobal = SSRResult;
				let componentProps, componentSlots;

				if (args.length === 2) {
					[componentProps, componentSlots] = args;
				} else {
					[astroGlobal, componentProps, componentSlots] = args;
				}

				const astroSlots = {
					/** @param {string} name */
					has: (name) => {
						if (!componentSlots) return false;
						return Boolean(componentSlots[name]);
					},
					/** @param {string} name */
					render: (name) => {
						return renderSlotToString(SSRResult, componentSlots[name]);
					},
				};
				return {
					__proto__: astroGlobal,
					props: componentProps,
					slots: astroSlots,
					request: new Request(window.location.href),
				};
			},
		};
		const result = await renderToString(SSRResult, component, props, {});
		const doc = document.implementation.createHTMLDocument();
		doc.body.innerHTML = result;

		doc.querySelectorAll("[data-editable-region-csr-id]").forEach((node) => {
			const csrId = Number(node.getAttribute("data-editable-region-csr-id"));
			renderRoots[csrId]?.(node);
		});

		renderRoots.length = 0;

		doc.querySelectorAll("link, [data-island-id]").forEach((node) => {
			node.remove();
		});

		doc.querySelectorAll("astro-island").forEach((node) => {
			for (const child of node.children) {
				node.before(child);
			}
			node.remove();
		});

		return doc.body;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
