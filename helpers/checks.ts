import EditableArrayItem from "../nodes/editable-array-item.js";
import EditableText from "../nodes/editable-text.js";
import Editable from "../nodes/editable.js";

const TAG_NAMES = [
	"EDITABLE-TEXT",
	"EDITABLE-COMPONENT",
	"EDITABLE-ARRAY-ITEM",
	"EDITABLE-ARRAY",
	"EDITABLE-IMAGE",
	"EDITABLE-SOURCE",
	"EDITABLE-SNIPPET",
];

const EDITABLE_REGION_TYPES = [
	"text",
	"component",
	"array",
	"array-item",
	"image",
	"source",
];

const CORRESPONDING_NAME: Record<string, string> = {
	"EDITABLE-TEXT": "text",
	"EDITABLE-COMPONENT": "component",
	"EDITABLE-ARRAY-ITEM": "array-item",
	"EDITABLE-ARRAY": "array",
	"EDITABLE-IMAGE": "image",
	"EDITABLE-SOURCE": "source",
};

export const hasEditable = <T extends object>(
	el: T,
): el is T & { editable: Editable } => {
	return "editable" in el && el.editable instanceof Editable;
};

export const hasEditableText = <T extends object>(
	el: T,
): el is T & { editable: EditableText } => {
	return "editable" in el && el.editable instanceof EditableText;
};

export const hasEditableArrayItem = <T extends object>(
	el: T,
): el is T & { editable: EditableArrayItem } => {
	return "editable" in el && el.editable instanceof EditableArrayItem;
};

export const isEditableWebcomponent = (el: unknown): boolean => {
	if (!(el instanceof HTMLElement)) {
		return false;
	}

	return TAG_NAMES.includes(el.tagName);
};

export const isEditableElement = (el: unknown): boolean => {
	if (!(el instanceof HTMLElement)) {
		return false;
	}

	return (
		TAG_NAMES.includes(el.tagName) ||
		(!!el.dataset.editable &&
			EDITABLE_REGION_TYPES.includes(el.dataset.editable))
	);
};

export const areEqualEditables = (a: HTMLElement, b: HTMLElement) => {
	if (
		a.tagName !== b.tagName &&
		a.dataset.editable !== b.dataset.editable &&
		CORRESPONDING_NAME[a.tagName] !== b.dataset.editable &&
		CORRESPONDING_NAME[b.tagName] !== a.dataset.editable
	) {
		return false;
	}

	if (Object.keys(a.dataset).length !== Object.keys(b.dataset).length) {
		return false;
	}

	return Object.keys(a.dataset).every(
		(key) => a.dataset[key] === b.dataset[key],
	);
};

export const isEditableText = (el?: Element | null): boolean => {
	return (
		el?.tagName === "EDITABLE-TEXT" ||
		(el instanceof HTMLElement && el.dataset.editable === "text")
	);
};

export const isEditableArrayItem = (el?: Element | null): boolean => {
	return (
		el?.tagName === "EDITABLE-ARRAY-ITEM" ||
		(el instanceof HTMLElement && el.dataset.editable === "array-item")
	);
};

export const areEqualNodes = (a: ChildNode, b: ChildNode) => {
	if (a.nodeName !== b.nodeName) {
		return false;
	}

	if (a instanceof Element && b instanceof Element) {
		if (a.className !== b.className) {
			return false;
		}

		if (a.id !== b.id) {
			return false;
		}

		if (a.attributes.length !== b.attributes.length) {
			return false;
		}

		for (let i = 0; i < a.attributes.length; i++) {
			if (
				a.attributes[i].name !== b.attributes[i].name ||
				a.attributes[i].value !== b.attributes[i].value
			) {
				return false;
			}
		}

		return true;
	}
	return a.isEqualNode(b);
};
