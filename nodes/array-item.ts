import "../components/ui/array-controls.js";
import type { WindowType } from "../types/window.js";
import ArrayEditable from "./array-editable.js";
import ComponentEditable from "./component-editable.js";

declare const window: WindowType;

export default class ArrayItem extends ComponentEditable {
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

		if (!this.parent || !(this.parent instanceof ArrayEditable)) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render array item");
			error.setAttribute(
				"message",
				"Parent array editable not found. Array items must be a descendant of an array editable.",
			);
			this.element.replaceChildren(error);
			return false;
		}

		return true;
	}

	onHover(e: DragEvent): void {
		const source = this.parent?.resolveSource();
		if (!source || !e.dataTransfer || !e.dataTransfer?.types.includes(source)) {
			return;
		}
		e.preventDefault();

		this.element.classList.add("dragover");
		this.element.style.outline = "3px solid var(--ccve-color-sol)";
	}

	mount(): void {
		if (!this.controlsElement) {
			this.controlsElement = document.createElement("array-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				const source = this.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}
				window.CloudCannon?.edit(source, undefined, e);
			});

			this.controlsElement.addEventListener("dragstart", (e: DragEvent) => {
				const source = this.parent?.resolveSource();
				if (!source || !e.dataTransfer || !this.element.dataset.prop) {
					return;
				}

				const clientRect = this.element.getBoundingClientRect();

				e.stopPropagation();
				this.element.classList.add("dragging");
				this.element.style.outline = "none";

				e.dataTransfer.setDragImage(this.element, clientRect.width - 35, 35);
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer?.setData(source, this.element.dataset.prop);
			});

			this.element.append(this.controlsElement);
		}

		this.element.ondragend = () => {
			this.element.classList.remove("dragging");
			this.element.style.outline = "";
		};

		this.element.ondragenter = this.onHover.bind(this);
		this.element.ondragover = this.onHover.bind(this);

		this.element.ondragleave = (e: DragEvent): void => {
			e.stopPropagation();

			this.element.classList.remove("dragover");
			this.element.style.outline = "";
		};

		this.element.ondrop = (e: DragEvent): void => {
			this.element.classList.remove("dragover");
			this.element.style.outline = "";

			if (!e.dataTransfer) {
				return;
			}

			const source = this.parent?.resolveSource();
			if (!source) {
				throw new Error("Source not found");
			}

			const data = e.dataTransfer.getData(source);
			const fromIndex = Number(data);
			const newIndex = Number(this.element.dataset.prop);

			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "move";

			if (window.CloudCannon && fromIndex !== newIndex) {
				window.CloudCannon.moveArrayItem(source, fromIndex, newIndex);
			}
		};
	}

	setupListeners(): void {
		super.setupListeners();
		this.parent?.registerListener({ editable: this });
	}
}
