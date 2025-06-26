import {
	ArrayEditable,
	ArrayItem,
	type Editable,
	ImageEditable,
	LiveComponent,
	TextEditable,
} from "../nodes";
import type { WindowType } from "../types/window.js";

declare const window: WindowType;

const editableMap: Record<string, typeof Editable | undefined> = {
	text: TextEditable,
	component: LiveComponent,
	array: ArrayEditable,
	"array-item": ArrayItem,
	image: ImageEditable,
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
