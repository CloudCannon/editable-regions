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
			"`params.editable_regions.template_dirs` (default: layouts/partials) " +
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
 * @param {string} componentKey
 * @param {string[]} availablePartials
 * @returns {Error}
 */
export function missingComponentError(componentKey, availablePartials) {
	const shortlist = availablePartials.slice(0, 15).join(", ");
	return new Error(
		`No Hugo partial found for component "${componentKey}". Expected a ` +
			`template at layouts/partials/${componentKey}` +
			(componentKey.endsWith(".html") ? "" : `[.html]`) +
			`. Bundled partials include: ${shortlist}${availablePartials.length > 15 ? ", …" : ""}`,
	);
}
