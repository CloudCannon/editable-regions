import type { WindowType } from "../types/window.js";
import ArrayItem from "./array-item.js";
import Editable, { type EditableListener } from "./editable.js";

declare const window: WindowType;

export default class ArrayEditable extends Editable {
	dragEl: ArrayItem | undefined = undefined;
	hoverEl: ArrayItem | undefined = undefined;
	value: unknown[] | undefined = undefined;

	registerListener(listener: EditableListener): void {
		this.listeners = this.listeners.filter(
			(other) => listener.editable.element !== other.editable.element,
		);

		const index = this.listeners.findIndex(
			(other) =>
				listener.editable.element.compareDocumentPosition(
					other.editable.element,
				) & Node.DOCUMENT_POSITION_FOLLOWING,
		);

		if (index !== -1) {
			this.listeners.splice(index, 0, listener);
		} else {
			this.listeners.push(listener);
		}

		if (!this.dragEl) {
			this.listeners.forEach(({ editable }, index) => {
				editable.element.dataset.prop = `${index}`;
				if (this.value) {
					editable.pushValue(this.value[index]);
				}
			});
		}
	}

	deregisterListener(target: Editable): void {
		this.listeners = this.listeners.filter(
			({ editable }) => editable.element !== target.element,
		);
		if (!this.dragEl) {
			this.listeners.forEach(({ editable }, index) => {
				editable.element.dataset.prop = `${index}`;
				if (this.value) {
					editable.pushValue(this.value[index]);
				}
			});
		}
	}

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

		const children = this.listeners.map(({ editable }) => editable.element);

		const childKeys = children.map((element) => {
			return element.dataset.key;
		});

		console.log({ dataKeys, childKeys });

		const equal = dataKeys?.every((key, i) => key === childKeys[i]);
		if (equal && children.length === dataKeys?.length) {
			children.forEach((child, index) => {
				child.dataset.prop = `${index}`;
				(child as any).editable.pushValue(value[index]);
			});
			return;
		}

		dataKeys?.forEach((key, i) => {
			const existingElement = children[i];
			const matchingChild = children.find((child) => child.dataset.key === key);
			// TODO rearrange nodes to avoid extra dom manipulation
			const newEl =
				(matchingChild?.cloneNode(true) as HTMLElement) ||
				document.createElement("array-item");

			newEl.dataset.key = String(key);
			newEl.dataset.prop = `${i}`;

			if (existingElement) {
				existingElement.replaceWith(newEl);
			} else {
				this.element.appendChild(newEl);
			}

			(newEl as any).editable.pushValue(value[i]);
		});

		children.forEach((child) => child.remove());
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
