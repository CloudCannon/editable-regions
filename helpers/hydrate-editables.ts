import {
	ArrayEditable,
	ArrayItem,
	ComponentEditable,
	type Editable,
	ImageEditable,
	SourceEditable,
	TextEditable,
} from "../nodes";
import { hasEditable } from "./checks";

const editableMap: Record<string, typeof Editable | undefined> = {
	array: ArrayEditable,
	"array-item": ArrayItem,
	component: ComponentEditable,
	image: ImageEditable,
	source: SourceEditable,
	text: TextEditable,
};

export const dehydrateDataEditables = (root: Element) => {
	if (root instanceof HTMLElement && hasEditable(root)) {
		root.editable.disconnect();
	}

	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (element instanceof HTMLElement && hasEditable(element)) {
			element.editable.disconnect();
		}
	});
};

export const hydrateDataEditables = (root: Element) => {
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
			const error = document.createElement("error-card");
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
