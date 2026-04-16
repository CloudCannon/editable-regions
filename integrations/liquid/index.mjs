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
 * Inspects a LiquidJS error and returns a new Error with a more
 * descriptive, actionable message for the editable-region error card.
 *
 * @param {unknown} err - The original error
 * @param {string} componentName - The component or template being rendered
 * @returns {Error} An enhanced error with a user-friendly message
 */
function enhanceLiquidError(err, componentName) {
	const message = err instanceof Error ? err.message : String(err);

	const unknownFilter = message.match(/undefined filter[:.]?\s*(\S+)/i);
	if (unknownFilter) {
		const filterName = unknownFilter[1];
		return new Error(
			`Unknown filter "${filterName}" while rendering "${componentName}". ` +
				`Please check your config and make sure you have registered "${filterName}" in the filters option.`,
		);
	}

	const missingTemplate = message.match(/ENOENT.*?"([^"]+)"/);
	if (missingTemplate) {
		const filePath = missingTemplate[1];
		return new Error(
			`Failed to find included template "${filePath}" while rendering "${componentName}". ` +
				`Please check that the file exists and is within your configured component directories.`,
		);
	}

	const missingTag = message.match(/tag "?(\S+?)"? not found/i);
	if (missingTag) {
		const tagName = missingTag[1];
		return new Error(
			`Unknown tag "${tagName}" while rendering "${componentName}". ` +
				`Please check your config and make sure you have registered "${tagName}" in the tags, shortcodes, or pairedShortcodes option.`,
		);
	}

	return new Error(
		`Error rendering "${componentName}": ${message}`,
	);
}

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
		"include_with",
		createIncludeWithTag(sharedLiquidEngine),
	);
	log("include_with tag registered");
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
		let htmlString;
		try {
			htmlString = await liquidEngine.parseAndRender(contents, props);
		} catch (err) {
			log("Error during render:", err);
			groupEnd();
			throw enhanceLiquidError(err, key);
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

	window.cc_components = window.cc_components || {};
	window.cc_components[key] = wrappedComponent;
	log(`Component registered, ${key}`);
}

/**
 * Wraps `window.cc_components` in a Proxy that dynamically creates
 * render functions for any component name not explicitly registered.
 * The dynamic renderer delegates to Liquid's `{% include %}` tag,
 * which resolves the component via the engine's configured `root` and `extname`.
 *
 * Must be called after `createSharedLiquidEngine()`.
 *
 * @returns {void}
 */
export function initComponentProxy() {
	if (!sharedLiquidEngine) {
		throw new Error(
			"sharedLiquidEngine not defined when initializing component proxy",
		);
	}
	const liquidEngine = sharedLiquidEngine;

	const target = window.cc_components || {};

	window.cc_components = new Proxy(target, {
		get(target, prop, receiver) {
			// Check whether a component is explicitly registered
			// And return that instead of dynamically creating one
			if (Reflect.has(target, prop)) {
				return Reflect.get(target, prop, receiver);
			}
			// Return a renderer that will use Liquid's include resolution
			if (typeof prop === "string") {
				return async (props) => {
					group(`Rendering component: ${prop}`);
					log("Props:", props);
					let htmlString;
					try {
						htmlString = await liquidEngine.parseAndRender(
							`{% include "${prop}" %}`,
							props,
						);
					} catch (err) {
						log("Error during render:", err);
						groupEnd();
						throw enhanceLiquidError(err, prop);
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
			return undefined;
		},
	});

	log("Component proxy initialized");
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
 * Creates an include_with tag for spreading object props into includes.
 * Like Astro's {...props} spread for Liquid includes.
 *
 * Usage: {% include_with "path/to/partial", objectToSpread %}
 *
 * @param {any} _liquidEngine - The LiquidJS engine instance (provided by LiquidJS, accessed via this.liquid)
 * @returns {any} Tag implementation with parse and render methods
 */
export function createIncludeWithTag(_liquidEngine) {
	return {
		/**
		 * Parses the include_with tag arguments.
		 * @param {any} tagToken - The tag token from LiquidJS parser
		 */
		parse(tagToken) {
			log("include_with parsing tag with args:", tagToken.args);
			const tokenizer = new Tokenizer(
				tagToken.args,
				this.liquid.options.operatorsTrie,
			);

			this.pathToken = tokenizer.readValue();
			if (!this.pathToken)
				throw new Error("include_with: missing path argument");
			log("include_with parsed path token:", this.pathToken);

			tokenizer.skipBlank();
			if (tokenizer.peek() !== ",")
				throw new Error("include_with: expected comma separator");
			tokenizer.advance();
			tokenizer.skipBlank();

			this.objectToken = tokenizer.readValue();
			if (!this.objectToken)
				throw new Error("include_with: missing object argument");
			log("include_with parsed object token:", this.objectToken);
		},

		/**
		 * Renders the included template with spread props.
		 * @param {any} context - The LiquidJS render context
		 */
		async render(context) {
			group("include_with rendering");
			log("Evaluating path token...");
			const path = await toPromise(evalToken(this.pathToken, context));
			log("Path resolved to:", path);

			log("Evaluating object token...");
			const obj = await toPromise(evalToken(this.objectToken, context));
			log("Object resolved to:", obj);

			if (!path || typeof path !== "string") {
				groupEnd();
				throw new Error(`include_with: invalid path "${path}"`);
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
				throw enhanceLiquidError(err, `include_with "${path}"`);
			} finally {
				context.pop();
			}
		},
	};
}
