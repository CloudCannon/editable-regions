/**
 * Inspects a LiquidJS error and returns a new Error with a more
 * descriptive, actionable message for the editable-region error card.
 *
 * @param {unknown} err - The original error
 * @param {string} componentName - The component or template being rendered
 * @returns {Error} An enhanced error with a user-friendly message
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
