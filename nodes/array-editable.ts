import { hasArrayItemEditable } from "../helpers/checks.js";
import type { WindowType } from "../types/window.js";
import ArrayItem from "./array-item.js";
import Editable from "./editable.js";

declare const window: WindowType;

export default class ArrayEditable extends Editable {
	dragEl: ArrayItem | undefined = undefined;
	hoverEl: ArrayItem | undefined = undefined;
	value: unknown[] | undefined = undefined;

	registerListener(): void {}

	deregisterListener(): void {}

	validateValue(value: unknown): unknown[] | undefined {
		if (!Array.isArray(value)) {
			return undefined;
		}
		return value;
	}

	update(): void {
		const value = this.value;
		if (!value) {
			throw new Error("array-editable updated with invalid value");
		}

		const dataKeys = this.value?.map((item) => {
			const key = this.element.dataset.key;
			return key ? (item as any)[key] : item;
		});

		const children: (HTMLElement & { editable: ArrayItem })[] = [];
		for (const child of this.element.querySelectorAll(
			"array-item,[data-editable='array-item']",
		)) {
			if (!hasArrayItemEditable(child)) {
				continue;
			}

			let parent = child.editable.parent?.element ?? child.parentElement;
			while (parent && !("editable" in parent)) {
				parent = parent.parentElement;
			}
			if (!parent || parent.editable !== this) {
				continue;
			}

			children.push(child as any);
		}

		const childKeys = children.map((element) => {
			return element.dataset.key;
		});

		console.log({ dataKeys, childKeys });

		const equal = dataKeys?.every((key, i) => key === childKeys[i]);
		if (equal && children.length === dataKeys?.length) {
			children.forEach((child, index) => {
				child.dataset.prop = `${index}`;
				child.editable.pushValue(value[index]);
			});
			return;
		}

		const placeholders = children.map((child) => {
			const placeholder = document.createElement("array-placeholder");
			child.after(placeholder);
			return placeholder;
		});

		const moved: Record<number, boolean> = {};

		dataKeys?.forEach((key, i) => {
			const placeholder = placeholders[i];
			const existingElement = children[i];
			const matchingChildIndex = children.findIndex(
				(child, i) => child.dataset.key === key && !moved[i],
			);

			let matchingChild = children[matchingChildIndex];
			if (!matchingChild) {
				const clone = children.find((child) => child.dataset.key === key);
				matchingChild = clone
					? (clone.cloneNode(true) as any)
					: document.createElement("array-item");
			} else {
				moved[matchingChildIndex] = true;
			}

			matchingChild.dataset.key = String(key);
			matchingChild.dataset.prop = `${i}`;

			if (existingElement === matchingChild) {
				placeholder.remove();
			} else if (placeholder) {
				placeholder.replaceWith(matchingChild);
			} else {
				this.element.appendChild(matchingChild);
			}

			matchingChild.editable.parent = this;
			matchingChild.editable.pushValue(value[i]);
		});

		children.forEach((child, i) => {
			if (!moved[i]) {
				child.remove();
			}
		});
		window.hydrateDataEditables?.(this.element);
	}

	mount(): void {
		this.element.addEventListener("moveStart", (e) => {
			e.stopPropagation();
			if (!((e.detail as any) instanceof ArrayItem)) {
				throw new Error("Invalid Drag: Drag started from an invalid element");
			}
			this.dragEl = e.detail as any;
		});

		this.element.addEventListener("moveEnd", (e) => {
			e.stopPropagation();
			if (!this.dragEl || !this.hoverEl) {
				throw new Error("Invalid Drag: Drag or hover element not found");
			}
			const fromIndex = Number(this.dragEl.element.dataset.prop);
			const newIndex = Number(this.hoverEl.element.dataset.prop);
			this.dragEl.noSwapBack = false;
			this.hoverEl.noSwapBack = false;
			this.dragEl = undefined;
			this.hoverEl = undefined;

			const source = this.resolveSource();
			if (!source) {
				throw new Error("Invalid Source: Source not found");
			}
			if (window.CloudCannon) {
				window.CloudCannon.moveArrayItem(source, fromIndex, newIndex);
			}
		});

		this.element.addEventListener("moveHover", (e) => {
			e.stopPropagation();

			if (
				!this.dragEl ||
				!((e.detail as any) instanceof ArrayItem) ||
				this.hoverEl?.element === e.target ||
				this.dragEl.element === e.target
			) {
				return;
			}

			if (this.hoverEl) {
				this.hoverEl.noSwapBack = false;
			}
			const hoverEl = e.detail as any;
			if (!hoverEl || !(hoverEl instanceof ArrayItem)) {
				throw new Error(
					"Invalid Hover Element: Hover element is not an ArrayItem",
				);
			}
			this.hoverEl = hoverEl;
			if (this.hoverEl.noSwapBack) {
				return;
			}

			const previous = this.dragEl.element.previousSibling;
			const next = this.dragEl.element.nextSibling;

			this.hoverEl.element.replaceWith(this.dragEl.element);

			if (!previous) {
				this.element.prepend(this.hoverEl.element);
			} else if (!next) {
				this.element.append(this.hoverEl.element);
			} else if (previous !== this.hoverEl.element) {
				(previous as Element).after(this.hoverEl.element);
			} else {
				(next as Element).before(this.hoverEl.element);
			}

			this.hoverEl.noSwapBack = true;
		});
	}
}
