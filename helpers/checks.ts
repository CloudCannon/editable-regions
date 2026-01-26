import Editable from "../nodes/editable.js";
import EditableArrayItem from "../nodes/editable-array-item.js";
import EditableText from "../nodes/editable-text.js";

const getEditableType = (el: HTMLElement): string | undefined => {
	if (el.tagName.startsWith("EDITABLE-")) {
		return el.tagName.slice(9).toLowerCase();
	}
	return el.dataset.editable;
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

	return el.tagName.startsWith("EDITABLE-");
};

export const isEditableElement = (el: unknown): boolean => {
	if (!(el instanceof HTMLElement)) {
		return false;
	}

	return (
		el.tagName.startsWith("EDITABLE-") ||
		typeof el.dataset.editable === "string"
	);
};

export const areEqualEditables = (a: HTMLElement, b: HTMLElement) => {
	if (getEditableType(a) !== getEditableType(b)) {
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

export const isEditableArray = (el?: Element | null): boolean => {
	return (
		el?.tagName === "EDITABLE-ARRAY" ||
		(el instanceof HTMLElement && el.dataset.editable === "array")
	);
};
