import "../components/ui/array-controls.js";
import type { WindowType } from "../types/window.js";
import ComponentEditable from "./component-editable.js";

declare const window: WindowType;

export default class ArrayItem extends ComponentEditable {
	dragging = false;
	noSwapBack = false;

	validateConfiguration(): boolean {
		const key = this.element.dataset.component;
		if (key) {
			const component = window.cc_components?.[key];
			if (!component) {
				this.element.classList.add("errored");
				const error = document.createElement("error-card");
				error.setAttribute("heading", "Failed to render component");
				error.setAttribute("message", `Couldn't find component '${key}'`);
				this.element.replaceChildren(error);
				return false;
			}
		}

		return true;
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
