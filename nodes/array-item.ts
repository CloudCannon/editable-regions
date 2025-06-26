import Editable, { type EditableListener } from "./editable.js";
import "../components/ui/array-controls.js";
import type { WindowType } from "../types/window.js";

declare const window: WindowType;

export default class ArrayItem extends Editable {
	dragging = false;
	editButton: HTMLElement | undefined = undefined;
	dragHandle: HTMLElement | undefined = undefined;
	controlsElement: HTMLElement | undefined = undefined;
	noSwapBack = false;

	pushValue(value: unknown, listener?: EditableListener): void {
		if (this.dragging) {
			return;
		}
		super.pushValue(value, listener);
	}

	registerListener(listener: EditableListener): void {
		if (
			this.listeners.find(
				({ editable: other, key }) =>
					listener.editable.element === other.element && listener.key === key,
			)
		) {
			return;
		}

		if (this.value && !this.dragging) {
			listener.editable.pushValue(this.value, listener);
		}

		this.listeners.push(listener);
	}

	mount(): void {
		if (!this.controlsElement) {
			const clientRect = this.element.getBoundingClientRect();
			this.controlsElement = document.createElement("array-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				const source = this.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}
				window.CloudCannon?.edit(source, undefined, e);
			});
			this.controlsElement.addEventListener("dragstart", (e: DragEvent) => {
				e.stopPropagation();
				if (e.dataTransfer) {
					e.dataTransfer.setDragImage(this.element, clientRect.width - 35, 35);
					e.dataTransfer.effectAllowed = "move";
				}
				this.dragging = true;
				this.element.dispatchEvent(
					new CustomEvent("moveStart", { detail: this, bubbles: true }),
				);
			});
			this.controlsElement.addEventListener("dragend", (e: DragEvent) => {
				e.stopPropagation();
				this.dragging = false;
			});

			this.element.append(this.controlsElement);
		}

		this.element.ondragenter = (e: DragEvent): void => {
			if (this.noSwapBack) {
				e.stopPropagation();
			} else {
				e.preventDefault();
			}
		};

		this.element.ondragover = (e: DragEvent): void => {
			e.preventDefault();
			e.stopPropagation();
			this.element.dispatchEvent(
				new CustomEvent("moveHover", { detail: this, bubbles: true }),
			);
		};

		this.element.ondrop = (e: DragEvent): void => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "move";
			}
			this.element.dispatchEvent(
				new CustomEvent("moveEnd", { detail: this, bubbles: true }),
			);
		};
	}

	setupListeners(): void {
		super.setupListeners();
		this.parent?.registerListener({ editable: this });
	}
}
