/**
 * Rewrites a LiquidJS error into an actionable message for the error card.
 *
 * @param {unknown} err
 * @param {string} componentName
 * @returns {Error}
 */
export function enhanceLiquidError(err, componentName) {
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

	return new Error(`Error rendering "${componentName}": ${message}`);
}
