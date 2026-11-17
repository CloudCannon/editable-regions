import "../../helpers/globals.js";
import {
	renderSlotToString,
	renderToString,
} from "astro/runtime/server/index.js";
import { addEditableComponentRenderer } from "../../helpers/cloudcannon.js";

type ClientSideRenderFunction = (node: Element) => void;

type FrameworkRenderer = {
	name: string;
	clientEntrypoint?: string;
	ssr: {
		check: (
			Component: any,
			props: any,
			slots: Record<string, string>,
			metadata?: any,
		) => boolean | Promise<boolean>;
		renderToStaticMarkup: (
			Component: any,
			props: any,
			slots: Record<string, string>,
			metadata?: any,
		) => Promise<{ html: string } | string>;
	};
};

const renderRoots: ClientSideRenderFunction[] = [];

const renderers: FrameworkRenderer[] = [
	{
		name: "dynamic-tags",
		ssr: {
			check: (Component) => {
				return typeof Component === "string";
			},
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

export const addFrameworkRenderer = (renderer: FrameworkRenderer): void => {
	renderers.push(renderer);
};

export const queueForClientSideRender = (
	renderFunction: ClientSideRenderFunction,
): number => {
	renderRoots.push(renderFunction);
	return renderRoots.length - 1;
};

export const registerAstroComponent = (
	key: string,
	component: unknown,
): void => {
	const wrappedComponent = async (props: any): Promise<HTMLElement> => {
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
		} catch (_err) {
			console.warn(
				"[CloudCannon] Could not generate a key for Astro component. This may cause issues with Astro components that use server-islands",
			);
		}

		// Hand-rolled subset of Astro's SSR internals, which have no public types.
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
			createAstro(...args: any[]) {
				if (args.length < 2 || args.length > 3) {
					console.warn(
						`[CloudCannon] createAstro called with unexpected number of arguments (${args.length})`,
					);
				}

				let astroGlobal = SSRResult;
				let componentProps: any;
				let componentSlots: any;

				if (args.length === 2) {
					[componentProps, componentSlots] = args;
				} else {
					[astroGlobal, componentProps, componentSlots] = args;
				}

				const astroSlots = {
					has: (name: string) => {
						if (!componentSlots) return false;
						return Boolean(componentSlots[name]);
					},
					render: (name: string) => {
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
