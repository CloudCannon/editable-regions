/**
 * Auto-mirrors an Eleventy config's helpers into the live-editing engine. The
 * bundle imports the user's *real* config (so closures and imports survive,
 * unlike `fn.toString()`) and replays it here against a recording stand-in for
 * `eleventyConfig`, capturing every `addFilter`/`addShortcode`/etc. call.
 *
 * Node/build-time APIs the config imports are stubbed at bundle time (see
 * `../index.mjs`), so importing them is harmless; only a helper that invokes
 * one at render time fails.
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
import {
	builtinFilterNames,
	builtinShortcodeNames,
} from "./liquid-builtins.mjs";

/** @type {Record<HelperKind, (name: string, fn: any) => void>} */
const KIND_REGISTRARS = {
	filters: registerFilter,
	shortcodes: registerShortcode,
	pairedShortcodes: registerPairedShortcode,
	tags: registerCustomTag,
};

/**
 * Maps each 11ty registration method to its `[kind, layer]`. Universal and
 * Liquid-specific siblings feed the same kind; the Liquid layer wins on a
 * collision, mirroring 11ty's `{ ...universal, ...liquid }` precedence.
 * Variants for other engines (JS/Handlebars/Nunjucks) aren't mirrored.
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

/**
 * Eleventy accepts a plugin as either a config function directly or as a
 * `{ configFunction, ... }` object. Returns the underlying function, or `null`
 * if it's neither (so the caller can skip it).
 *
 * @param {any} plugin
 * @returns {((config: any, opts: any) => void) | null}
 */
function resolvePluginFunction(plugin) {
	if (typeof plugin === "function") return plugin;
	if (typeof plugin?.configFunction === "function")
		return plugin.configFunction;
	return null;
}

/** @returns {Record<HelperKind, Map<string, any>>} */
function createEmptyLayer() {
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
 * @param {unknown} config - The config's default export (a function), or a
 *   module namespace whose `.default` is that function (ESM/CJS interop).
 * @param {{ skip?: Partial<Record<HelperKind, string[]>> }} [options] - Per-kind
 *   override names to skip; builtin browser-port names are skipped automatically.
 */
export function collectAndRegisterEleventyHelpers(config, options = {}) {
	const configFn =
		typeof config === "function"
			? config
			: /** @type {any} */ (config)?.default;

	if (typeof configFn !== "function") {
		warnOnce(
			"eleventy-config-shape",
			"Could not auto-mirror Eleventy config helpers: the config's default " +
				"export isn't a function. Filters/shortcodes defined in the config " +
				"won't be available in live editing.",
		);
		return;
	}

	// Skip builtin browser-port names (derived from `liquid-builtins.mjs`) so a
	// same-named config helper can't clobber our port, plus caller overrides.
	/** @type {Record<HelperKind, Set<string>>} */
	const skip = {
		filters: new Set([...builtinFilterNames, ...(options.skip?.filters ?? [])]),
		shortcodes: new Set([
			...builtinShortcodeNames,
			...(options.skip?.shortcodes ?? []),
		]),
		pairedShortcodes: new Set(options.skip?.pairedShortcodes ?? []),
		tags: new Set(options.skip?.tags ?? []),
	};

	const layers = { universal: createEmptyLayer(), liquid: createEmptyLayer() };

	/** @type {Record<string, any>} */
	const recorder = {};
	for (const [method, [kind, layer]] of Object.entries(METHOD_TARGETS)) {
		recorder[method] = (
			/** @type {string} */ name,
			/** @type {any} */ helperFn,
		) => {
			if (typeof name === "string" && typeof helperFn === "function") {
				layers[layer][kind].set(name, helperFn);
			}
		};
	}

	// Unrecorded methods are no-ops so running the real config (which calls
	// `addPassthroughCopy`, `on`, sets `dir`, ...) doesn't throw.
	const configRecorder = new Proxy(recorder, {
		get(target, prop, receiver) {
			if (prop in target) return Reflect.get(target, prop, receiver);
			return () => {};
		},
	});

	recorder.addPlugin = (/** @type {any} */ plugin, /** @type {any} */ opts) => {
		const pluginFn = resolvePluginFunction(plugin);
		if (!pluginFn) return;

		// A plugin is itself a config function, so replay it against the same
		// recorder to capture the helpers it registers.
		try {
			pluginFn(configRecorder, opts);
		} catch {
			// Node-only plugins are stubbed at bundle time and throw when called.
			// Helpers registered before the throw are kept; the config continues.
		}
	};

	try {
		configFn(configRecorder);
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
