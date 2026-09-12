/**
 * Maps raw Hugo renderer errors to actionable messages. The message ends up
 * on the core's component error card, so it should tell the user what to fix.
 */

const TEMPLATE_FRAME_RE =
	/^template: (.+?): executing ".*?" at .*?: error calling (.+?): /;
const FAILED_SEPARATOR = ": execute of template failed: ";

export interface ParsedHugoError {
	/** Template refs (file:line:column), outermost call first. */
	frames: string[];
	/** The template function whose call failed in the innermost frame. */
	call?: string;
	/** The underlying error, with the template-call chain stripped. */
	message: string;
}

export function parseHugoTemplateError(raw: string): ParsedHugoError {
	const frames: string[] = [];
	let call: string | undefined;
	let rest = raw.trim();
	for (;;) {
		const match = rest.match(TEMPLATE_FRAME_RE);
		if (!match) break;
		frames.push(match[1]);
		call = match[2];
		rest = rest.slice(match[0].length);
		const quotedSeparator = rest.match(
			/^"[^"]*": execute of template failed: /,
		);
		if (quotedSeparator) {
			rest = rest.slice(quotedSeparator[0].length);
		} else {
			const separator = rest.indexOf(FAILED_SEPARATOR);
			const after =
				separator === -1 ? "" : rest.slice(separator + FAILED_SEPARATOR.length);
			if (after.startsWith("template: ")) {
				rest = after;
			}
		}
	}
	return { frames, call, message: rest };
}

/** An error enhanced with an optional editor-context hint. */
export type HugoError = Error & { hint?: string };

export function enhanceHugoError(
	message: string,
	componentKey: string,
): HugoError {
	const parsed = parseHugoTemplateError(message);

	let hint = "";

	if (/partial .* not found/i.test(message)) {
		hint =
			"This partial isn't in the bundled template snapshot. Check that it " +
			"lives under one of the directories in " +
			"`params.editable_regions.template_dirs` (by default the partials, " +
			"render hooks, and shortcodes of your configured layout dir) " +
			"and rebuild the site.";
	} else if (parsed.frames.length > 0) {
		hint =
			"The partial errored while rendering in the editor. If the code " +
			"should only run in the site build, guard it with " +
			"`{{ if not site.Params.env_client }}`, " +
			"or supply an editor-safe version via " +
			"`params.editable_regions.templates_overrides`.";
	} else if (/logged \d+ errors/i.test(message)) {
		hint =
			"Hugo logged errors during the render — open the browser console " +
			"for the underlying messages.";
	}

	const primary =
		parsed.frames.length > 0 && parsed.call
			? `${parsed.call}: ${parsed.message}`
			: parsed.message;
	const sentence = /[.!?]$/.test(primary) ? primary : `${primary}.`;

	const error = new Error(
		`Failed to render Hugo component "${componentKey}": ${sentence}`,
	) as HugoError;

	if (hint) {
		error.hint = hint;
	}

	if (parsed.frames.length > 0) {
		error.stack = parsed.frames
			.slice()
			.reverse()
			.slice(0, 10)
			.map((ref) => `    at ${ref}`)
			.join("\n");
	}

	return error;
}

/** Error for a partial missing from the editor's template bundle; raised when
 * the dispatch layout's `templates.Exists` check fails. */
export function missingComponentError(componentKey: string): Error {
	return new Error(
		`No Hugo partial found for component "${componentKey}". This partial ` +
			`isn't captured in the editor's template bundle. Make sure it's a ` +
			`partial, shortcode, or render hook under your layout tree and ` +
			`rebuild the site.`,
	);
}
