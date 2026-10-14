import type EditableRegionErrorCard from "../components/ui/editable-region-error-card.js";

/**
 * Builds an `<editable-region-error-card>` with the given content. The caller
 * decides where to place it (usually `element.replaceChildren(...)`).
 */
export function createErrorCard(
	heading: string,
	message?: string,
	hint?: string,
): EditableRegionErrorCard {
	const error = document.createElement("editable-region-error-card");
	error.setAttribute("heading", heading);
	if (typeof message === "string") {
		error.setAttribute("message", message);
	}
	if (typeof hint === "string") {
		error.setAttribute("hint", hint);
	}
	return error;
}
