import ArrayItem from "../nodes/array-item.js";
import Editable from "../nodes/editable.js";
import TextEditable from "../nodes/text-editable.js";

const TAG_NAMES = [
	"TEXT-EDITABLE",
	"LIVE-COMPONENT",
	"ARRAY-ITEM",
	"ARRAY-EDITABLE",
];

const EDITABLE_TYPES = ["text", "component", "array", "array-item"];

const CORRESPONDING_NAME: Record<string, string> = {
	TEXT_EDITABLE: "text",
	LIVE_COMPONENT: "component",
	ARRAY_ITEM: "array-item",
	ARRAY_EDITABLE: "array",
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

export const isLiveComponent = (el: HTMLElement): boolean => {
	return el.tagName === "LIVE-COMPONENT" || el.dataset.editable === "component";
};

export const isArrayItem = (el: HTMLElement): boolean => {
	return el.tagName === "ARRAY-ITEM" || el.dataset.editable === "array-item";
};

export const isArrayEditable = (el: HTMLElement): boolean => {
	return el.tagName === "ARRAY-EDITABLE" || el.dataset.editable === "array";
};
