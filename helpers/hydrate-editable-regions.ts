import {
	Editable,
	EditableArray,
	EditableArrayItem,
	EditableComponent,
	EditableImage,
	EditableSource,
	EditableText,
} from "../nodes";
import { hasEditable } from "../nodes/editable.js";
import { isEditableWebcomponent } from "./checks";

const DYNAMIC_EDITABLE_TYPE = "_dynamic";

const baseEditableMap: Record<string, typeof Editable | undefined> = {
	array: EditableArray,
	"array-item": EditableArrayItem,
	component: EditableComponent,
	image: EditableImage,
	source: EditableSource,
	text: EditableText,
};

export const dehydrateDataEditableRegions = (root: Element) => {
	if (
		root instanceof HTMLElement &&
		hasEditable(root) &&
		root.dataset.editable !== DYNAMIC_EDITABLE_TYPE
	) {
		root.editable.disconnect();
	}

	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (
			!(element instanceof HTMLElement) ||
			element.dataset.editable === DYNAMIC_EDITABLE_TYPE
		) {
			return;
		}

		if (hasEditable(element)) {
			element.editable.disconnect();
		}
	});
};

export const hydrateDataEditableRegions = (root: Element) => {
	const editableMap: Record<string, typeof Editable | undefined> = {
		...baseEditableMap,
		...((window as any).editableRegionMap ?? {}),
	};
	if (
		root instanceof HTMLElement &&
		root.dataset.editable &&
		root.dataset.editable !== DYNAMIC_EDITABLE_TYPE &&
		!isEditableWebcomponent(root)
	) {
		if ("editable" in root && root.editable instanceof Editable) {
			root.editable.connect();
		} else {
			const Editable = editableMap[root.dataset.editable];
			if (Editable) {
				const editable = new Editable(root);
				editable.connect();
			}
		}
	}

	root.querySelectorAll("[data-editable]").forEach((element) => {
		if (!(element instanceof HTMLElement) || isEditableWebcomponent(element)) {
			return;
		}

		if (
			typeof element.dataset.editable !== "string" ||
			typeof element.dataset.cloudcannonIgnore === "string"
		) {
			return;
		}

		if (element.dataset.editable === DYNAMIC_EDITABLE_TYPE) {
			return;
		}

		const Editable = editableMap[element.dataset.editable];
		if (!Editable) {
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render editable region");
			error.setAttribute(
				"message",
				`This element has an invalid editable type for the 'data-editable' HTML attribute. The supported editable types are ${Object.keys(
					editableMap,
				)
					.map((type) => `"${type}"`)
					.join(
						", ",
					)} but instead received the type "${element.dataset.editable}". Please make sure that this element has a valid "data-editable" attribute.`,
			);
			error.setAttribute(
				"hint",
				"If this is intentional you can use the 'data-cloudcannon-ignore' attribute to exclude this element from editable regions.",
			);
			element.replaceWith(error);
			return;
		}

		if ("editable" in element && element.editable instanceof Editable) {
			element.editable.connect();
		} else {
			const editable = new Editable(element);
			editable.connect();
		}
	});
};

const extendedWindow = /** @type {any} */ (window);

Object.assign(extendedWindow, {
	editableRegions: {
		Editable,
		EditableArray,
		EditableArrayItem,
		EditableComponent,
		EditableImage,
		EditableSource,
		EditableText,
	},
	hydrateDataEditableRegions,
});

document.dispatchEvent(new CustomEvent("editable-regions:load"));
