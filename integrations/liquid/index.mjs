import { Liquid } from "liquidjs";
import { enhanceLiquidError } from "./errors.mjs";
import { inMemoryFs } from "./fs.mjs";
import {
	buildCollectionsData,
	buildPageData,
	setEleventyData,
} from "./globals.mjs";
import { createIncludeWithTag } from "./include-with-tag.mjs";
import { group, groupEnd, log } from "./logger.mjs";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.mjs";

// Re-exported from their own modules (which avoid this file's browser-runtime
// side-effects) so the Node-side plugin can reach them via the package root.
export { createIncludeWithTag } from "./include-with-tag.mjs";
export { group, groupEnd, log, setVerbose } from "./logger.mjs";
export { registerPageMap } from "./page-map.mjs";

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/**
 * Creates the shared Liquid engine with the built-in `includeWith` tag. The
 * host wires up its filters/shortcodes/ports afterwards (e.g.
 * `registerEleventyBuiltins(engine)`).
 *
 * @param {import("liquidjs").LiquidOptions} [options] - Spread into `new Liquid(...)`
 */
export function createSharedLiquidEngine(options) {
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

/**
 * Pins a Liquid component under `key`, taking precedence over the
 * include-resolution proxy. Used for `pluginOptions.liquid.components`.
 *
 * @param {string} key
 * @param {string} contents
 */
export function registerLiquidComponent(key, contents) {
	log("Registering component:", key);

	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering component ${key}`,
		);
	}

	window.cc_components = window.cc_components || {};
	window.cc_components[key] = createComponentRenderer(key, contents);
}

/**
 * Wraps `window.cc_components` in a Proxy that resolves any component name on
 * demand via `{% include %}` — the primary resolution path. Names registered
 * via `registerLiquidComponent` take precedence. Call after
 * `createSharedLiquidEngine()`.
 *
 * @returns {void}
 */
export function initComponentProxy() {
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

/**
 * Sets the `eleventy` global on the shared engine. Built at build time by the
 * bundle generator; this is a thin setter.
 *
 * @param {{version: string, generator: string, env: {runMode: string, source: string}, directories: Record<string, string>}} data
 */
export function registerEleventyData(data) {
	if (!sharedLiquidEngine) {
		throw new Error(
			"sharedLiquidEngine not defined when registering eleventy data",
		);
	}
	/** @type {any} */ (sharedLiquidEngine).options.globals.eleventy = data;
	// Also surface to `globals` so the page proxy can derive `outputPath`.
	setEleventyData(data);
	log("Registered eleventy data, version:", data?.version);
}

/**
 * Merges user-supplied globals (`pluginOptions.globals`) onto the engine. The
 * built-in globals (`page`, `collections`, `eleventy`, `pkg`) are applied
 * separately and take precedence per render.
 *
 * @param {Record<string, unknown>} globals
 */
export function registerGlobals(globals) {
	if (!sharedLiquidEngine) {
		throw new Error("sharedLiquidEngine not defined when registering globals");
	}
	Object.assign(
		/** @type {any} */ (sharedLiquidEngine).options.globals,
		globals ?? {},
	);
	log("Registered", Object.keys(globals ?? {}).length, "custom globals");
}

/**
 * Sets the `pkg` global (11ty exposes `package.json` this way by default).
 *
 * @param {Record<string, any>} pkg
 */
export function registerPkg(pkg) {
	if (!sharedLiquidEngine) {
		throw new Error("sharedLiquidEngine not defined when registering pkg");
	}
	/** @type {any} */ (sharedLiquidEngine).options.globals.pkg = pkg ?? {};
	log("Registered pkg, fields:", Object.keys(pkg ?? {}).length);
}

/**
 * Registers a Liquid filter. Called by both the auto-mirror pass and
 * user-supplied overrides (`pluginOptions.liquid.filters`).
 *
 * @param {string} name
 * @param {any} fn
 */
export function registerFilter(name, fn) {
	log("Registering filter:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering filter ${name}`,
		);
	}
	sharedLiquidEngine.registerFilter(name, fn);
}

/**
 * Registers a Liquid shortcode. Usage: {% shortcodeName arg1, arg2 %}
 *
 * @param {string} name
 * @param {any} fn - (arg1, arg2, ...) => string
 */
export function registerShortcode(name, fn) {
	log("Registering shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createShortcodeTag(name, fn));
}

/**
 * Registers a Liquid paired shortcode.
 * Usage: {% shortcodeName arg %}content{% endshortcodeName %}
 *
 * @param {string} name
 * @param {any} fn - (content, arg1, ...) => string
 */
export function registerPairedShortcode(name, fn) {
	log("Registering paired shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering paired shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
}

/**
 * Registers a custom tag with full LiquidJS parser access (the factory
 * receives the engine). Usage: {% tagName args %}
 *
 * @param {string} name
 * @param {any} factory - (liquidEngine) => { parse(), render() }
 */
export function registerCustomTag(name, factory) {
	log("Registering custom tag:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering custom tag ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, factory(sharedLiquidEngine));
}

/**
 * Wraps `parseAndRender` with logging, error mapping, and HTMLElement output.
 *
 * @param {string} name
 * @param {string} templateSource - A literal template, or `{% include "name" %}`
 * @returns {(props: Record<string, any>) => Promise<HTMLElement>}
 */
function createComponentRenderer(name, templateSource) {
	return async (props) => {
		if (!sharedLiquidEngine) {
			throw new Error(
				`sharedLiquidEngine not defined when rendering component ${name}`,
			);
		}
		group(`Rendering component: ${name}`);
		log("Props:", props);

		let htmlString;
		try {
			htmlString = await sharedLiquidEngine.parseAndRender(
				templateSource,
				// `page`/`collections` spread last so props can't shadow them
				// (mirroring 11ty); they resolve at the top-level globals level.
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
