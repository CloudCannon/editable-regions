/**
 * Browser-side collector that auto-mirrors an Eleventy config's helpers into
 * the live-editing Liquid engine.
 *
 * Serialising each registered filter/shortcode via `fn.toString()` and
 * embedding the text would silently drop anything the function closed over —
 * module-scope constants, imported helpers, `this` — which is the common case
 * for real-world helpers, not the exception.
 *
 * So instead the generated bundle imports the user's *real* Eleventy config
 * (bundled by esbuild with its dependency graph intact) and replays it here
 * against a recording stand-in for `eleventyConfig`. Every `addFilter` /
 * `addShortcode` / `addPairedShortcode` / `addLiquidTag` call is captured with
 * the live, closure-preserving function and registered into the shared engine.
 *
 * Node/build-time APIs the config imports (`@11ty/eleventy`, `node:*`, the
 * editable-regions plugin itself) are stubbed at bundle time (see the esbuild
 * `stub` plugin in `../index.mjs`) with proxies that throw only when *called*.
 * So importing them is harmless, and only a helper that actually invokes one
 * at render time fails — exactly as it must, since it can't run in a browser.
 *
 * @typedef {"filters" | "shortcodes" | "pairedShortcodes" | "tags"} HelperKind
 */

import {
	registerCustomTag,
	registerFilter,
	registerPairedShortcode,
	registerShortcode,
} from "../../liquid/index.mjs";
import { warnOnce } from "../../liquid/logger.mjs";

/**
 * The runtime registration fn for each helper kind.
 * @type {Record<HelperKind, (name: string, fn: any) => void>}
 */
const KIND_REGISTRARS = {
	filters: registerFilter,
	shortcodes: registerShortcode,
	pairedShortcodes: registerPairedShortcode,
	tags: registerCustomTag,
};

/**
 * Maps each 11ty registration method to its `[kind, layer]`. `universal`
 * methods (`addFilter`) and their Liquid-specific siblings (`addLiquidFilter`)
 * feed the same kind; the Liquid layer wins on a name collision, mirroring
 * 11ty's `{ ...universal, ...liquid }` precedence. Tags only exist on the
 * Liquid layer (`addLiquidTag`).
 *
 * The async universal variants (`addAsyncFilter`, `addAsyncShortcode`,
 * `addPairedAsyncShortcode`) feed the same kinds — async vs sync is irrelevant
 * once we just hand the function to the registrar. There's no
 * `addLiquidAsync*`: the Liquid-specific methods already accept async
 * functions. The JavaScript/Handlebars/Nunjucks-specific variants target other
 * template engines, so they're deliberately not mirrored into the Liquid engine.
 *
 * @type {Record<string, [HelperKind, "universal" | "liquid"]>}
 */
const METHOD_TARGETS = {
	addFilter: ["filters", "universal"],
	addAsyncFilter: ["filters", "universal"],
	addLiquidFilter: ["filters", "liquid"],
	addShortcode: ["shortcodes", "universal"],
	addAsyncShortcode: ["shortcodes", "universal"],
	addLiquidShortcode: ["shortcodes", "liquid"],
	addPairedShortcode: ["pairedShortcodes", "universal"],
	addPairedAsyncShortcode: ["pairedShortcodes", "universal"],
	addPairedLiquidShortcode: ["pairedShortcodes", "liquid"],
	addLiquidTag: ["tags", "liquid"],
};

/** @returns {Record<HelperKind, Map<string, any>>} */
function emptyLayer() {
	return {
		filters: new Map(),
		shortcodes: new Map(),
		pairedShortcodes: new Map(),
		tags: new Map(),
	};
}

/**
 * Replays `configFn` against a recording stand-in and registers every
 * collected helper that isn't skipped.
 *
 * @param {unknown} configFn - The Eleventy config's default export (a function),
 *   or a module namespace whose `.default` is that function (ESM/CJS interop).
 * @param {{ skip?: Partial<Record<HelperKind, string[]>> }} [options] -
 *   Per-kind names to skip: handwritten browser ports (so those win) and
 *   names the user overrode via `pluginOptions.liquid.<kind>` (emitted
 *   separately as module imports so the override wins).
 */
export function collectAndRegisterEleventyHelpers(configFn, options = {}) {
	const fn =
		typeof configFn === "function"
			? configFn
			: /** @type {any} */ (configFn)?.default;

	if (typeof fn !== "function") {
		warnOnce(
			"eleventy-config-shape",
			"Could not auto-mirror Eleventy config helpers: the config's default " +
				"export isn't a function. Filters/shortcodes defined in the config " +
				"won't be available in live editing.",
		);
		return;
	}

	/** @type {Record<HelperKind, Set<string>>} */
	const skip = {
		filters: new Set(options.skip?.filters ?? []),
		shortcodes: new Set(options.skip?.shortcodes ?? []),
		pairedShortcodes: new Set(options.skip?.pairedShortcodes ?? []),
		tags: new Set(options.skip?.tags ?? []),
	};

	const layers = { universal: emptyLayer(), liquid: emptyLayer() };

	/** @type {Record<string, any>} */
	const recorder = {};
	for (const [method, [kind, layer]] of Object.entries(METHOD_TARGETS)) {
		recorder[method] = (/** @type {string} */ name, /** @type {any} */ fn2) => {
			if (typeof name === "string" && typeof fn2 === "function") {
				layers[layer][kind].set(name, fn2);
			}
		};
	}

	// Any config method we don't explicitly record is a no-op so running the
	// real config function (which calls `addPlugin`, `addPassthroughCopy`,
	// `on`, sets `dir`, ...) doesn't throw.
	const fakeConfig = new Proxy(recorder, {
		get(target, prop, receiver) {
			if (prop in target) return Reflect.get(target, prop, receiver);
			return () => {};
		},
	});

	// Replay function plugins too, so helpers registered by a plugin (rather
	// than directly in the config) are mirrored as well — matching the old
	// behaviour of reading 11ty's post-plugin registry. A plugin that throws
	// (e.g. a stubbed Node-only one) is contained: helpers it registered
	// before throwing are kept, the rest of the config continues.
	recorder.addPlugin = (/** @type {any} */ plugin, /** @type {any} */ opts) => {
		const pluginFn =
			typeof plugin === "function" ? plugin : plugin?.configFunction;
		if (typeof pluginFn !== "function") return;
		try {
			pluginFn(fakeConfig, opts);
		} catch {
			// Stubbed/Node-only plugins are expected to throw here — ignore.
		}
	};

	try {
		fn(fakeConfig);
	} catch (err) {
		warnOnce(
			"eleventy-config-replay",
			"Replaying the Eleventy config to mirror its helpers threw: " +
				`${err instanceof Error ? err.message : err}. Some filters/` +
				"shortcodes may be unavailable in live editing — define a browser " +
				"override via `pluginOptions.liquid.<kind>` for any that are needed.",
		);
	}

	for (const kind of /** @type {HelperKind[]} */ (
		Object.keys(KIND_REGISTRARS)
	)) {
		const register = KIND_REGISTRARS[kind];
		// Liquid layer spread last so it wins on a name collision.
		const merged = new Map([...layers.universal[kind], ...layers.liquid[kind]]);

		for (const [name, helperFn] of merged) {
			if (skip[kind].has(name)) continue;
			try {
				register(name, helperFn);
			} catch (err) {
				warnOnce(
					`eleventy-mirror:${kind}:${name}`,
					`Failed to mirror Eleventy ${kind} "${name}" into live editing: ` +
						`${err instanceof Error ? err.message : err}.`,
				);
			}
		}
	}
}
