/** Config replay skips and warns (an argument-side call must not abort the config); render time throws. */

import { log, warnOnce } from "../../liquid/logger.js";
import { createInertValue } from "./inert.js";

/** Stub calls from this plugin's own entry are expected and silent. */
const SELF_SPECIFIER = "@cloudcannon/editable-regions/eleventy";

let strict = false;

export function setStubsStrict(): void {
	strict = true;
}

export function onStubInvoked(
	specifier: string,
	verb: "called" | "constructed",
): any {
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
