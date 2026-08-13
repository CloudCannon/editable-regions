/**
 * Maps raw Hugo renderer errors to actionable messages. The message ends up
 * on the core's component error card, so it should tell the user what to fix.
 */

/**
 * @param {string} message - Raw error string from the WASM renderer
 * @param {string} componentKey - The component being rendered
 * @returns {Error}
 */
export function enhanceHugoError(message, componentKey) {
	let hint = "";

	if (/partial .* not found/i.test(message)) {
		hint =
			" This partial isn't in the bundled template snapshot. Check that it " +
			"lives under one of the directories in " +
			"`params.editable_regions.template_dirs` (by default the partials, " +
			"render hooks, and shortcodes of your configured layout dir) " +
			"and rebuild the site.";
	} else if (/execute of template failed/i.test(message)) {
		hint =
			" The partial errored while rendering in the editor. If it depends on " +
			"build-only state (page context, resources, .Site.Pages), guard that " +
			"code with `if hugo.IsServer` or move it out of the component.";
	} else if (/logged \d+ errors/i.test(message)) {
		hint =
			" Hugo logged errors during the render — open the browser console " +
			"for the underlying messages.";
	}

	return new Error(
		`Failed to render Hugo component "${componentKey}": ${message}.${hint}`,
	);
}

/**
 * Error for a component whose partial isn't in the editor's template bundle.
 * Raised by the runtime when the dispatch layout's templates.Exists check
 * (rendered as a missing-partial marker) reports that the name doesn't
 * resolve.
 * @param {string} componentKey
 * @returns {Error}
 */
export function missingComponentError(componentKey) {
	return new Error(
		`No Hugo partial found for component "${componentKey}". This partial ` +
			`isn't captured in the editor's template bundle. Make sure it's a ` +
			`partial, shortcode, or render hook under your layout tree and ` +
			`rebuild the site.`,
	);
}
