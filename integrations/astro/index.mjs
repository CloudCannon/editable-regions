import {
	renderSlotToString,
	renderToString,
} from "astro/runtime/server/index.js";
import { addEditableComponentRenderer } from "../../dist/helpers/cloudcannon.js";
/**
 * Queue of React components waiting to be rendered
 * @type {((node: Element) => void)[]}
 */
const renderRoots = [];

const renderers = [
	{
		name: "dynamic-tags",
		ssr: {
			/**
			 * Checks if the component is a string (HTML tag name).
			 * @param {any} Component - The component to check
			 * @returns {boolean} True if component is a string tag name
			 */
			check: (Component) => {
				return typeof Component === "string";
			},
			/**
			 * Renders a dynamic HTML tag with props and slots.
			 * @param {string} Component - The HTML tag name
			 * @param {Record<string, any>} props - Props to render as attributes
			 * @param {Record<string, string>} slots - Slot content
			 * @returns {Promise<string>} The rendered HTML string
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
 * Registers an Astro component with the CloudCannon component system.
 * Creates a wrapper that handles Astro SSR rendering with React hydration support.
 *
 * @param {string} key - Unique identifier for the component
 * @param {unknown} component - The Astro component function to register
 * @returns {void}
 */
export const registerAstroComponent = (key, component) => {
	/**
	 * Wrapper function that renders the Astro component with SSR and client-side hydration.
	 *
	 * @param {any} props - Props to pass to the Astro component
	 * @returns {Promise<HTMLElement>} The rendered component as an HTMLElement
	 */
	const wrappedComponent = async (props) => {
		/**
		 * Encryption key for Astro server islands
		 * @type {CryptoKey | undefined}
		 */
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
		} catch (err) {
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
			/**
			 * @param {*} astroGlobal
			 * @param {*} props
			 * @param {*} slots
			 */
			createAstro(astroGlobal, props, slots) {
				const astroSlots = {
					/**
					 * @param {string} name
					 * @returns boolean
					 */
					has: (name) => {
						if (!slots) return false;
						return Boolean(slots[name]);
					},
					/**
					 * @param {string} name
					 * @returns string
					 */
					render: (name) => {
						return renderSlotToString(SSRResult, slots[name]);
					},
				};
				return {
					__proto__: astroGlobal,
					props,
					slots: astroSlots,
					request: new Request(window.location.href),
				};
			},
		};
		// Render the Astro component to HTML string
		const result = await renderToString(SSRResult, component, props, {});
		const doc = document.implementation.createHTMLDocument();
		doc.body.innerHTML = result;

		doc.querySelectorAll("[data-editable-region-csr-id]").forEach((node) => {
			const csrId = Number(node.getAttribute("data-editable-region-csr-id"));
			renderRoots[csrId]?.(node);
		});

		// Clear the React roots queue
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

	// Register the wrapped component in the global registry
	addEditableComponentRenderer(key, wrappedComponent);
};
