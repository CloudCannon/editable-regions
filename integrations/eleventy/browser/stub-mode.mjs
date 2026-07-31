/**
 * Strictness switch for the stubs `createBrowserStubPlugin` generates. The two
 * phases want opposite behaviour:
 *
 * - **Config replay** — skip and warn. An argument-side call like
 *   `addPlugin(pluginBookshop({…}))` runs before `addPlugin` is reached, so a
 *   throw escapes the config function and loses every helper below that line.
 * - **Render time** — throw. That's the documented signal to add a
 *   `pluginOptions.liquid.<kind>` override, named by `enhanceLiquidError`.
 *
 * `collect-config.mjs` flips it once the mirror finishes; `initComponentProxy`
 * holds renders until then, so the phases can't overlap.
 */

import { log, warnOnce } from "../../liquid/logger.mjs";
import { createInertValue } from "./inert.mjs";

/**
 * This plugin's own Eleventy entry — the one entry in `ALWAYS_STUBBED`. Every
 * config calls it via `addPlugin`, and the browser bundle registers its helpers
 * itself, so skipping it is expected and there's nothing to act on.
 */
const SELF_SPECIFIER = "@cloudcannon/editable-regions/eleventy";

let strict = false;

/** Called by the mirror once every helper has been registered. */
export function setStubsStrict() {
	strict = true;
}

/**
 * @param {string} specifier - The stubbed module, e.g. `"node:fs"`
 * @param {"called" | "constructed"} verb
 * @returns {any} An inert stand-in, while we're still replaying the config
 */
export function onStubInvoked(specifier, verb) {
	if (strict) {
		throw new Error(
			`editable-regions: "${specifier}" was ${verb} in the browser ` +
				"live-editing bundle. It's a Node/build-time module with no browser " +
				"equivalent — provide an override via pluginOptions.liquid.<kind>.",
		);
	}

	if (specifier === SELF_SPECIFIER) {
		log(
			`[editable-regions] "${specifier}" was ${verb} and skipped, as expected.`,
		);
	} else {
		warnOnce(
			`eleventy-stub:${specifier}`,
			`[editable-regions] "${specifier}" was ${verb} while replaying your ` +
				"Eleventy config for live editing. It's a Node/build-time module, so " +
				"the call was skipped and the rest of the config still mirrored. If a " +
				"filter or shortcode is missing from the editor, this is the reason.",
		);
	}

	return createInertValue();
}
