import "../../helpers/globals.js";
import type { LiquidOptions } from "liquidjs";
import { Liquid } from "liquidjs";
import { enhanceLiquidError } from "./errors.js";
import { inMemoryFs } from "./fs.js";
import {
	buildCollectionsData,
	buildPageData,
	setEleventyData,
} from "./globals.js";
import { createIncludeWithTag } from "./include-with-tag.js";
import { group, groupEnd, log } from "./logger.js";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.js";

declare global {
	interface Window {
		cc_liquid_files?: Record<string, string>;
	}
}

export { createIncludeWithTag } from "./include-with-tag.js";
export { group, groupEnd, log, setVerbose } from "./logger.js";
export { registerPageMap } from "./page-map.js";

export interface EleventyData {
	version: string;
	generator: string;
	env: { runMode: string; source: string };
	directories: Record<string, string>;
}

let sharedLiquidEngine: Liquid | null = null;

export function createSharedLiquidEngine(options?: LiquidOptions): Liquid {
	log("Creating shared Liquid engine");

	sharedLiquidEngine = new Liquid({
		fs: inMemoryFs,
		globals: {
			ENV_CLIENT: true,
		},
		...options,
	});

	log(
		"Available files in window.cc_liquid_files:",
		Object.keys(window.cc_liquid_files || {}),
	);

	sharedLiquidEngine.registerTag(
		"includeWith",
		createIncludeWithTag(sharedLiquidEngine),
	);

	return sharedLiquidEngine;
}

export function registerLiquidComponent(key: string, contents: string): void {
	log("Registering component:", key);

	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering component ${key}`,
		);
	}

	window.cc_components = window.cc_components || {};
	window.cc_components[key] = createComponentRenderer(key, contents);
}

// Call after createSharedLiquidEngine and last: publishing cc_components signals all helpers are ready.
export function initComponentProxy(): void {
	if (!sharedLiquidEngine) {
		throw new Error(
			"sharedLiquidEngine not defined when initializing component proxy",
		);
	}

	const target = window.cc_components || {};

	window.cc_components = new Proxy(target, {
		get(registered, key, receiver) {
			if (Reflect.has(registered, key)) {
				return Reflect.get(registered, key, receiver);
			}
			if (typeof key === "string") {
				return createComponentRenderer(key, `{% include "${key}" %}`);
			}
			return undefined;
		},
	});
}

export function registerEleventyData(data: EleventyData): void {
	if (!sharedLiquidEngine) {
		throw new Error(
			"sharedLiquidEngine not defined when registering eleventy data",
		);
	}
	(sharedLiquidEngine.options.globals as Record<string, any>).eleventy = data;
	// Also surface to globals so the page proxy can derive outputPath.
	setEleventyData(data);
	log("Registered eleventy data, version:", data?.version);
}

export function registerGlobals(
	globals?: Record<string, unknown> | null,
): void {
	if (!sharedLiquidEngine) {
		throw new Error("sharedLiquidEngine not defined when registering globals");
	}
	Object.assign(sharedLiquidEngine.options.globals, globals ?? {});
	log("Registered", Object.keys(globals ?? {}).length, "custom globals");
}

export function registerPkg(pkg?: Record<string, any> | null): void {
	if (!sharedLiquidEngine) {
		throw new Error("sharedLiquidEngine not defined when registering pkg");
	}
	(sharedLiquidEngine.options.globals as Record<string, any>).pkg = pkg ?? {};
	log("Registered pkg, fields:", Object.keys(pkg ?? {}).length);
}

export function registerFilter(
	name: string,
	fn: (...args: any[]) => any,
): void {
	log("Registering filter:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering filter ${name}`,
		);
	}
	sharedLiquidEngine.registerFilter(name, fn);
}

export function registerShortcode(
	name: string,
	fn: (...args: any[]) => any,
): void {
	log("Registering shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createShortcodeTag(name, fn));
}

export function registerPairedShortcode(
	name: string,
	fn: (...args: any[]) => any,
): void {
	log("Registering paired shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering paired shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
}

export function registerCustomTag(
	name: string,
	factory: (liquidEngine: Liquid) => any,
): void {
	log("Registering custom tag:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering custom tag ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, factory(sharedLiquidEngine));
}

function createComponentRenderer(
	name: string,
	templateSource: string,
): (props: Record<string, any>) => Promise<HTMLElement> {
	return async (props) => {
		if (!sharedLiquidEngine) {
			throw new Error(
				`sharedLiquidEngine not defined when rendering component ${name}`,
			);
		}
		group(`Rendering component: ${name}`);
		log("Props:", props);

		let htmlString: any;
		try {
			htmlString = await sharedLiquidEngine.parseAndRender(
				templateSource,
				// page/collections spread last so props can't shadow them (as in 11ty).
				{
					...props,
					page: buildPageData(),
					collections: buildCollectionsData(),
				},
			);
		} catch (err) {
			log("Error during render:", err);
			groupEnd();
			throw enhanceLiquidError(err, name);
		}
		log(
			"Rendered HTML preview:",
			htmlString?.substring?.(0, 200) || htmlString,
		);
		const rootEl = document.createElement("div");
		rootEl.innerHTML = htmlString;
		groupEnd();
		return rootEl;
	};
}
