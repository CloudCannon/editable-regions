import { Liquid } from "liquidjs";
import { enhanceLiquidError } from "./errors.mjs";
import { inMemoryFs } from "./fs.mjs";
import {
	buildCollectionsData,
	buildPageData,
	setEleventyData,
} from "./globals.mjs";
import { createIncludeWithTag } from "./include-with-tag.mjs";
import { group, groupEnd, log, warnOnce } from "./logger.mjs";
import { createPairedShortcodeTag, createShortcodeTag } from "./shortcodes.mjs";

// Re-export so browser-bundle consumers can keep importing from the package
// root — the definition lives in `./include-with-tag.mjs` so the Node-side
// Eleventy plugin can import it without pulling in browser-runtime modules.
export { createIncludeWithTag } from "./include-with-tag.mjs";
// Re-export logger utilities for external use
export { group, groupEnd, log, setVerbose } from "./logger.mjs";

// `registerPageMap` is part of the runtime's public surface; the storage
// lives in `./page-map.mjs` so non-engine consumers (`globals.mjs`,
// `liquid-builtins.mjs`) can read it without an import cycle through here.
export { registerPageMap } from "./page-map.mjs";

/** @type {import("liquidjs").Liquid | null} */
let sharedLiquidEngine = null;

/**
 * Creates and configures the shared Liquid engine. Bundles `includeWith` —
 * a convenience tag for spreading an object into `{% include %}` rather
 * than listing each prop by hand; host-specific filters, shortcodes, and
 * built-in ports are wired up afterwards by the host (e.g.
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
	log("Liquid engine instantiated");

	log(
		"Available files in window.cc_liquid_files:",
		Object.keys(window.cc_liquid_files || {}),
	);

	sharedLiquidEngine.registerTag(
		"includeWith",
		createIncludeWithTag(sharedLiquidEngine),
	);
	log("includeWith tag registered");

	return sharedLiquidEngine;
}

/**
 * Registers a Liquid component under `key`, taking precedence over the
 * include-resolution proxy installed by `initComponentProxy` for that name.
 * Use this when you need to pin a different template — typically via
 * `pluginOptions.liquid.components` — for a name that would otherwise
 * resolve to its auto-discovered file via `{% include %}`.
 *
 * @param {string} key
 * @param {string} contents
 */
export function registerLiquidComponent(key, contents) {
	log("Registering component:", key);
	log("Component contents preview:", contents?.substring?.(0, 200) || contents);

	if (!sharedLiquidEngine) {
		throw new Error(
			`sharedLiquidEngine not defined when registering component ${key}`,
		);
	}

	window.cc_components = window.cc_components || {};
	window.cc_components[key] = createComponentRenderer(key, contents);
	log(`Component registered, ${key}`);
}

/**
 * Wraps `window.cc_components` in a Proxy that resolves any component name
 * to a renderer on demand. Each lookup returns a renderer that delegates to
 * Liquid's `{% include %}` tag, which finds the matching file via the
 * engine's configured `root` and `extname` (populated at build time from
 * `findAllLiquidFiles`). This is the primary resolution path.
 *
 * Names explicitly registered via `registerLiquidComponent` take precedence
 * — those are returned as-is rather than going through include resolution.
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

	const target = window.cc_components || {};

	window.cc_components = new Proxy(target, {
		get(registered, key, receiver) {
			// Explicit registrations take precedence over include resolution
			if (Reflect.has(registered, key)) {
				return Reflect.get(registered, key, receiver);
			}
			// Resolve via Liquid's include — the primary path for auto-discovered components
			if (typeof key === "string") {
				return createComponentRenderer(key, `{% include "${key}" %}`);
			}
			return undefined;
		},
	});

	log("Component proxy initialized");
}

/**
 * Sets the `eleventy` global on the shared engine, mirroring the
 * browser-applicable subset of https://www.11ty.dev/docs/data-eleventy-supplied/.
 * The bundle generator builds the data at build time; this is a thin setter.
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
	// Also surface to the `globals` module so the page proxy can derive
	// `outputPath` without reaching into the engine.
	setEleventyData(data);
	log("Registered eleventy data, version:", data?.version);
}

/**
 * Sets the `process.env` global so templates can read build-time env vars
 * via `{{ process.env.NAME }}`. The bundle generator builds `env` from
 * `pluginOptions.env` / `pluginOptions.envPrefix` at build time; this
 * function never reads `process.env` itself.
 *
 * @param {Record<string, string>} env
 */
export function registerProcessEnv(env) {
	if (!sharedLiquidEngine) {
		throw new Error(
			"sharedLiquidEngine not defined when registering process.env",
		);
	}
	/** @type {any} */ (sharedLiquidEngine).options.globals.process = { env };
	log("Registered", Object.keys(env).length, "process.env vars");
}

/**
 * Field names stripped from the user's `package.json` before it's embedded
 * in the bundle. These tend to dominate `package.json` size (hundreds of
 * dependency entries, dozens of npm scripts) and aren't typically read
 * from templates. Accessing one of these from a template returns
 * `undefined` and warns once (see `wrapPkgWithStripWarning` below).
 */
const STRIPPED_PKG_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
	"scripts",
];

/**
 * Wraps `pkg` so reads of known-stripped fields warn once instead of silently
 * returning `undefined`. Unknown property reads (typos, fields not present
 * in the user's package.json) still return `undefined` silently — we only
 * special-case the names we deliberately strip.
 *
 * @param {Record<string, any>} pkg
 */
function wrapPkgWithStripWarning(pkg) {
	const stripped = new Set(STRIPPED_PKG_FIELDS);
	return new Proxy(pkg, {
		get(target, key, receiver) {
			if (typeof key === "string" && stripped.has(key) && !(key in target)) {
				warnOnce(
					`pkg-stripped:${key}`,
					`pkg.${key} isn't available in live editing. The editable-regions ` +
						`Eleventy plugin strips ${STRIPPED_PKG_FIELDS.join(", ")} from ` +
						"the embedded package.json to keep the bundle small. If your " +
						"template needs this field, open an issue.",
				);
				return undefined;
			}
			return Reflect.get(target, key, receiver);
		},
	});
}

/**
 * Sets the `pkg` global, mirroring 11ty's default exposure of `package.json`.
 * The generator (`integrations/eleventy/index.mjs:buildPkg`) strips the heavy
 * fields listed in `STRIPPED_PKG_FIELDS`; `wrapPkgWithStripWarning` makes
 * reads of those names warn instead of silently returning `undefined`.
 *
 * @param {Record<string, any>} pkg
 */
export function registerPkg(pkg) {
	if (!sharedLiquidEngine) {
		throw new Error("sharedLiquidEngine not defined when registering pkg");
	}
	/** @type {any} */ (sharedLiquidEngine).options.globals.pkg =
		wrapPkgWithStripWarning(pkg ?? {});
	log("Registered pkg, fields:", Object.keys(pkg ?? {}).length);
}

/**
 * Registers a Liquid filter. Called by both the build-time auto-mirror pass
 * and by user-supplied browser overrides (`pluginOptions.liquid.filters`).
 * Overrides emitted last would win on collision, but the mirror pass already
 * skips override names so collisions shouldn't arise.
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
 * Registers a Liquid shortcode. Same dual-caller pattern as `registerFilter`.
 *
 * Usage in templates: {% shortcodeName arg1, arg2 %}
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
 * Registers a Liquid paired shortcode. Same dual-caller pattern as
 * `registerFilter`.
 *
 * Usage in templates: {% shortcodeName arg %}content{% endshortcodeName %}
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
 * Registers a custom tag with full LiquidJS parser access — more powerful
 * than a shortcode, since the factory receives the engine and can implement
 * arbitrary parse/render logic.
 *
 * Usage in templates: {% tagName args %}
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
 * Used by both the include-resolution proxy (`initComponentProxy`, the
 * primary path) and explicit registrations (`registerLiquidComponent`).
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

		log("Parsing and rendering template...");
		let htmlString;
		try {
			htmlString = await sharedLiquidEngine.parseAndRender(
				templateSource,
				// LiquidJS awaits top-level Promise scope values but not Promises
				// returned from property-access chains. `page` and `collections` are
				// spread last so component props cannot shadow them, mirroring 11ty.
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
