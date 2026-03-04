import { evalToken, Liquid, Tokenizer, toPromise } from "liquidjs";
import { eleventyFilters } from "./11ty-filters.mjs";
import { inMemoryFs } from "./fs.mjs";
import { group, groupEnd, log } from "./logger.mjs";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.mjs";

// Re-export logger utilities for external use
export { group, groupEnd, log, setVerbose } from "./logger.mjs";

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/**
 * Creates and configures the shared Liquid engine instance.
 *
 * @param {{componentDirs?: string[]}} options - Liquid engine options
 * @returns {void}
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
	log("Liquid engine instantiated");

	// Register Eleventy's built-in filters
	for (const [name, fn] of Object.entries(eleventyFilters)) {
		sharedLiquidEngine.registerFilter(name, fn);
	}
	log(
		"Registered",
		Object.keys(eleventyFilters).length,
		"built-in 11ty filters",
	);

	log(
		"Available files in window.cc_files:",
		Object.keys(window.cc_files || {}),
	);

	sharedLiquidEngine.registerTag(
		"bind_include",
		createBindIncludeTag(sharedLiquidEngine),
	);
	log("bind_include tag registered");
}

/**
 * Registers a Liquid component with the CloudCannon component system.
 * Creates a wrapper that renders the Liquid template to an HTMLElement.
 *
 * @param {string} key - Unique identifier for the component
 * @param {string} contents - The Liquid template contents
 * @returns {void}
 */
export function registerLiquidComponent(key, contents) {
	log("Registering component:", key);
	log("Component contents preview:", contents?.substring?.(0, 200) || contents);

	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering component ${key}`,
		);
	}
	const liquidEngine = sharedLiquidEngine;

	/**
	 * Wrapper function that renders the Liquid component to an HTMLElement.
	 *
	 * @param {Object} props - Props to pass to the Liquid template
	 * @returns {Promise<HTMLElement>} The rendered component as an HTMLElement
	 */
	const wrappedComponent = async (props) => {
		group(`Rendering component: ${key}`);
		log("Props:", props);
		log("Parsing and rendering template...");
		const htmlString = await liquidEngine.parseAndRender(contents, props);
		log(
			"Rendered HTML preview:",
			htmlString?.substring?.(0, 200) || htmlString,
		);
		const rootEl = document.createElement("div");
		rootEl.innerHTML = htmlString;
		groupEnd();
		return rootEl;
	};

	window.cc_components = window.cc_components || {};
	window.cc_components[key] = wrappedComponent;
	log(`Component registered, ${key}`);
}

/**
 * Registers a custom Liquid filter.
 *
 * @param {string} name - The filter name
 * @param {any} fn - The filter function
 * @returns {void}
 */
export function registerCustomFilter(name, fn) {
	log("Registering filter:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering custom filter ${name}`,
		);
	}
	sharedLiquidEngine.registerFilter(name, fn);
}

/**
 * Registers a custom shortcode.
 *
 * Usage in templates: {% shortcodeName arg1, arg2 %}
 *
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {any} fn - The shortcode function (arg1, arg2, ...) => string
 * @returns {void}
 */
export function registerCustomShortcode(name, fn) {
	log("Registering shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering custom shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createShortcodeTag(fn, name));
}

/**
 * Registers a custom paired shortcode (with content between tags).
 *
 * Usage in templates: {% shortcodeName arg %}content{% endshortcodeName %}
 *
 * @param {string} name - The shortcode name (used as the tag name)
 * @param {any} fn - The shortcode function (content, arg1, ...) => string
 * @returns {void}
 */
export function registerCustomPairedShortcode(name, fn) {
	log("Registering paired shortcode:", name);
	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering custom paired shortcode ${name}`,
		);
	}
	sharedLiquidEngine.registerTag(name, createPairedShortcodeTag(name, fn));
}

/**
 * Registers a custom tag with full LiquidJS parser access.
 *
 * Custom tags are more powerful than shortcodes - they receive full access to
 * the LiquidJS parser and can implement complex parsing/rendering logic.
 *
 * Usage in templates: {% tagName args %}
 *
 * @param {string} name - The tag name
 * @param {any} factory - Factory function (liquidEngine) => { parse(), render() }
 * @returns {void}
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
 * Creates a bind_include tag for spreading object props into includes.
 * Like Astro's {...props} spread for Liquid includes.
 *
 * Usage: {% bind_include "path/to/partial", objectToSpread %}
 *
 * @param {any} _liquidEngine - The LiquidJS engine instance (provided by LiquidJS, accessed via this.liquid)
 * @returns {any} Tag implementation with parse and render methods
 */
export function createBindIncludeTag(_liquidEngine) {
	return {
		/**
		 * Parses the bind_include tag arguments.
		 * @param {any} tagToken - The tag token from LiquidJS parser
		 */
		parse(tagToken) {
			log("bind_include parsing tag with args:", tagToken.args);
			const tokenizer = new Tokenizer(
				tagToken.args,
				this.liquid.options.operatorsTrie,
			);

			this.pathToken = tokenizer.readValue();
			if (!this.pathToken)
				throw new Error("bind_include: missing path argument");
			log("bind_include parsed path token:", this.pathToken);

			tokenizer.skipBlank();
			if (tokenizer.peek() !== ",")
				throw new Error("bind_include: expected comma separator");
			tokenizer.advance();
			tokenizer.skipBlank();

			this.objectToken = tokenizer.readValue();
			if (!this.objectToken)
				throw new Error("bind_include: missing object argument");
			log("bind_include parsed object token:", this.objectToken);
		},

		/**
		 * Renders the included template with spread props.
		 * @param {any} context - The LiquidJS render context
		 */
		async render(context) {
			group("bind_include rendering");
			log("Evaluating path token...");
			const path = await toPromise(evalToken(this.pathToken, context));
			log("Path resolved to:", path);

			log("Evaluating object token...");
			const obj = await toPromise(evalToken(this.objectToken, context));
			log("Object resolved to:", obj);

			if (!path || typeof path !== "string") {
				groupEnd();
				throw new Error(`bind_include: invalid path "${path}"`);
			}
			if (!obj || typeof obj !== "object") {
				log("Object is not valid, returning empty");
				groupEnd();
				return;
			}

			log(
				"Including:",
				path,
				"with",
				Object.keys(obj).length,
				"props:",
				Object.keys(obj),
			);

			context.push(obj);
			try {
				log("Parsing file:", path);
				const templates = await this.liquid.parseFile(path);
				log("File parsed, template count:", templates?.length || 0);

				log("Rendering templates...");
				const result = await this.liquid.render(templates, context);
				log("Rendered result preview:", result?.substring?.(0, 200) || result);
				groupEnd();
				return result;
			} catch (err) {
				const error = /** @type {Error} */ (err);
				log("Error during render:", error.message);
				log("Full error:", error);
				groupEnd();
				throw error;
			} finally {
				context.pop();
			}
		},
	};
}
