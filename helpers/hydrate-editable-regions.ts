import {
	type Editable,
	EditableArray,
	EditableArrayItem,
	EditableComponent,
	EditableImage,
	EditableSource,
	EditableText,
} from "../nodes";
import { hasEditable } from "./checks";

const editableMap: Record<string, typeof Editable | undefined> = {
	array: EditableArray,
	"array-item": EditableArrayItem,
	component: EditableComponent,
	image: EditableImage,
	source: EditableSource,
	text: EditableText,
};

export const dehydrateDataEditableRegions = (root: Element) => {
	if (root instanceof HTMLElement && hasEditable(root)) {
		root.editable.disconnect();
	}

	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (element instanceof HTMLElement && hasEditable(element)) {
			element.editable.disconnect();
		}
	});
};

export const hydrateDataEditableRegions = (root: Element) => {
	if (
		root instanceof HTMLElement &&
		root.dataset.editable &&
		!("editable" in root)
	) {
		const Editable = editableMap[root.dataset.editable];
		if (Editable) {
			const editable = new Editable(root);
			editable.connect();
		}
	}

	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (!(element instanceof HTMLElement) || "editable" in element) {
			return;
		}

		if (!element.dataset.editable || element.dataset.cloudcannonIgnore) {
			return;
		}

		const Editable = editableMap[element.dataset.editable];
		if (!Editable) {
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render editable region");
			error.setAttribute(
				"message",
				`Unrecognized editable type: "${element.dataset.editable}". The supported types are: ${Object.keys(editableMap).join(", ")}`,
			);
			element.replaceWith(error);
			return;
		}

		const editable = new Editable(element);

		editable.connect();
	});
};
