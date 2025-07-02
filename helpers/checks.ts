import ArrayItem from "../nodes/array-item.js";
import Editable from "../nodes/editable.js";
import TextEditable from "../nodes/text-editable.js";

const TAG_NAMES = [
	"TEXT-EDITABLE",
	"COMPONENT-EDITABLE",
	"ARRAY-ITEM",
	"ARRAY-EDITABLE",
	"IMAGE-EDITABLE",
	"SOURCE-EDITABLE",
];

const EDITABLE_TYPES = [
	"text",
	"component",
	"array",
	"array-item",
	"image",
	"source",
];

const CORRESPONDING_NAME: Record<string, string> = {
	"TEXT-EDITABLE": "text",
	"COMPONENT-EDITABLE": "component",
	"ARRAY-ITEM": "array-item",
	"ARRAY-EDITABLE": "array",
	"IMAGE-EDITABLE": "image",
	"SOURCE-EDITABLE": "source",
};

export const hasEditable = <T extends object>(
	el: T,
): el is T & { editable: Editable } => {
	return "editable" in el && el.editable instanceof Editable;
};

export const hasTextEditable = <T extends object>(
	el: T,
): el is T & { editable: TextEditable } => {
	return "editable" in el && el.editable instanceof TextEditable;
};

export const hasArrayItemEditable = <T extends object>(
	el: T,
): el is T & { editable: ArrayItem } => {
	return "editable" in el && el.editable instanceof ArrayItem;
};

export const isEditableElement = (el: unknown): el is HTMLElement => {
	if (!(el instanceof HTMLElement)) {
		return false;
	}

	return (
		TAG_NAMES.includes(el.tagName) ||
		(!!el.dataset.editable && EDITABLE_TYPES.includes(el.dataset.editable))
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

export const isTextEditable = (el: HTMLElement): boolean => {
	return el.tagName === "TEXT-EDITABLE" || el.dataset.editable === "text";
};

export const isComponentEditable = (el: HTMLElement): boolean => {
	return (
		el.tagName === "COMPONENT-EDITABLE" || el.dataset.editable === "component"
	);
};

export const isArrayItem = (el: HTMLElement): boolean => {
	return el.tagName === "ARRAY-ITEM" || el.dataset.editable === "array-item";
};

export const isArrayEditable = (el: HTMLElement): boolean => {
	return el.tagName === "ARRAY-EDITABLE" || el.dataset.editable === "array";
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
