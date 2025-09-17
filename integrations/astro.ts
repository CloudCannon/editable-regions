import {
	renderSlotToString,
	renderToString,
} from "astro/runtime/server/index.js";

import { type FunctionComponent, createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { addEditableComponentRenderer } from "../helpers/cloudcannon";

interface ReactRoot {
	Component: FunctionComponent<any>;
	props: any;
}

interface Renderer {
	name: string;
	clientEntrypoint?: string;
	ssr: {
		check: (Component: any) => boolean;
		renderToStaticMarkup: (
			Component: any,
			props: any,
			slots?: any,
		) => Promise<string | { html: string }>;
	};
}

interface AstroSlots {
	has: (name: string) => boolean;
	render: (name: string) => string;
}

interface AstroGlobal {
	__proto__: any;
	props: any;
	slots: AstroSlots;
	request: Request;
}

interface SSRResultType {
	styles: Set<any>;
	scripts: Set<any>;
	links: Set<any>;
	propagation: Map<any, any>;
	propagators: Map<any, any>;
	serverIslandNameMap: { get: () => string };
	key: CryptoKey | undefined;
	base: string;
	extraHead: any[];
	componentMetadata: Map<any, any>;
	renderers: Renderer[];
	_metadata: {
		renderers: Renderer[];
		hasHydrationScript: boolean;
		hasRenderedHead: boolean;
		hasDirectives: Set<any>;
	};
	clientDirectives: Map<string, string>;
	slots: any;
	props: any;
	resolve: (url: string) => string;
	createAstro: (astroGlobal: any, props: any, slots: any) => AstroGlobal;
}

/**
 * Queue of React components waiting to be rendered
 */
const reactRoots: ReactRoot[] = [];

/**
 * Array of renderers for different component types.
 * Handles both dynamic HTML tags and React components within Astro.
 */
const renderers: Renderer[] = [
	{
		name: "dynamic-tags",
		ssr: {
			/**
			 * Checks if the component is a string (HTML tag name).
			 * @param Component - The component to check
			 * @returns True if component is a string tag name
			 */
			check: (Component: any): boolean => {
				return typeof Component === "string";
			},
			/**
			 * Renders a dynamic HTML tag with props and slots.
			 * @param Component - The HTML tag name
			 * @param props - Props to render as attributes
			 * @param slots - Slot content
			 * @returns The rendered HTML string
			 */
			renderToStaticMarkup: async (
				Component: string,
				props: Record<string, any>,
				slots: Record<string, string>,
			): Promise<string> => {
				const propsString = Object.entries(props)
					.map(([key, value]) => `${key}="${value}"`)
					.join(" ");
				return `<${Component} ${propsString}>${
					slots.default ?? ""
				}</${Component}>`;
			},
		},
	},
	{
		name: "@astrojs/react",
		clientEntrypoint: "@astrojs/react/client.js",
		ssr: {
			/**
			 * Always returns true to handle all remaining components as React.
			 * @returns Always true
			 */
			check: (): boolean => true,
			/**
			 * Renders a React component to static markup or queues for client-side rendering.
			 * @param Component - The React component function
			 * @param props - Props to pass to the component
			 * @returns Object containing the rendered HTML
			 */
			renderToStaticMarkup: async (
				Component: FunctionComponent<any>,
				props: any,
			): Promise<{ html: string }> => {
				try {
					const reactNode = Component(props);
					return { html: renderToStaticMarkup(reactNode) };
				} catch (err) {
					// Queue for client-side rendering if SSR fails
					reactRoots.push({ Component, props });
					return {
						html: `<div data-react-root=${reactRoots.length - 1}></div>`,
					};
				}
			},
		},
	},
];

/**
 * Registers an Astro component with the CloudCannon component system.
 * Creates a wrapper that handles Astro SSR rendering with React hydration support.
 *
 * @param key - Unique identifier for the component
 * @param component - The Astro component function to register
 */
export const registerAstroComponent = (
	key: string,
	component: unknown,
): void => {
	/**
	 * Wrapper function that renders the Astro component with SSR and client-side hydration.
	 *
	 * @param target - The DOM element to render the component into
	 * @param props - Props to pass to the Astro component
	 */
	const wrappedComponent = async (props: any): Promise<HTMLElement> => {
		/**
		 * Encryption key for Astro server islands
		 */
		let encryptionKey: CryptoKey | undefined;
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

		/**
		 * Astro SSR result configuration object.
		 * Contains all necessary properties for Astro's server-side rendering.
		 */
		const SSRResult: SSRResultType = {
			styles: new Set(),
			scripts: new Set(),
			links: new Set(),
			propagation: new Map(),
			propagators: new Map(),
			serverIslandNameMap: { get: () => "Bookshop" },
			key: encryptionKey,
			base: "/",
			extraHead: [],
			componentMetadata: new Map(),
			renderers,
			_metadata: {
				renderers,
				hasHydrationScript: false,
				hasRenderedHead: true,
				hasDirectives: new Set(),
			},
			clientDirectives: new Map([
				["load", "cloudcannon-placeholder"],
				["idle", "cloudcannon-placeholder"],
				["visible", "cloudcannon-placeholder"],
				["media", "cloudcannon-placeholder"],
			]),
			slots: null,
			props,
			/**
			 * Resolves URLs (identity function for this implementation).
			 * @param url - The URL to resolve
			 * @returns The same URL
			 */
			resolve(url: string): string {
				return url;
			},
			/**
			 * Creates the Astro global object for component rendering.
			 * @param astroGlobal - The base Astro global object
			 * @param props - Component props
			 * @param slots - Component slots
			 * @returns The complete Astro object for rendering
			 */
			createAstro(astroGlobal: any, props: any, slots: any): AstroGlobal {
				const astroSlots: AstroSlots = {
					/**
					 * Checks if a named slot exists.
					 * @param name - The slot name to check
					 * @returns True if the slot exists
					 */
					has: (name: string): boolean => {
						if (!slots) return false;
						return Boolean(slots[name]);
					},
					/**
					 * Renders a named slot to string.
					 * @param name - The slot name to render
					 * @returns The rendered slot content
					 */
					render: (name: string): string => {
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
		const result = await renderToString(SSRResult, component, props, null);
		const doc = document.implementation.createHTMLDocument();
		doc.body.innerHTML = result;

		// Hydrate any queued React components that failed SSR
		doc.querySelectorAll("[data-react-root]").forEach((node) => {
			const reactRootId = Number(node.getAttribute("data-react-root"));
			const { Component, props } = reactRoots[reactRootId];
			const reactNode = createElement(Component, props, null);
			const root = createRoot(node);
			flushSync(() => root.render(reactNode));
		});

		// Clear the React roots queue
		reactRoots.length = 0;

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
