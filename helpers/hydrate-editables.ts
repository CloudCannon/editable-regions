import {
	ArrayEditable,
	ArrayItem,
	ComponentEditable,
	type Editable,
	ImageEditable,
	SourceEditable,
	TextEditable,
} from "../nodes";
import type { WindowType } from "../types/window.js";

declare const window: WindowType;

const editableMap: Record<string, typeof Editable | undefined> = {
	text: TextEditable,
	component: ComponentEditable,
	array: ArrayEditable,
	"array-item": ArrayItem,
	image: ImageEditable,
	source: SourceEditable,
};

const hydrateDataEditables = (root: Element) => {
	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (!(element instanceof HTMLElement) || "editable" in element) {
			return;
		}

		if (!element.dataset.editable) {
			return;
		}

		const Editable = editableMap[element.dataset.editable];
		if (!Editable) {
			return;
		}

		const editable = new Editable(element);

		editable.connect();
	});
};

window.hydrateDataEditables = hydrateDataEditables;
