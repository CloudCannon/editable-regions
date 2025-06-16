import Editable, { type EditableListener } from "./editable.js";

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
				({ editable: other }) => listener.editable.element === other.element,
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
		this.element.style.cssText = this.dragging
			? "position: relative; display: block; outline: 1px dashed #034ad8; opacity: 0.5"
			: "position: relative; display: block; outline: 1px solid #034ad8";

		if (!this.controlsElement) {
			this.controlsElement = document.createElement("div");
			this.controlsElement.classList.add(
				"c-cloudcannon-editor-overlay--focused",
			);
			this.controlsElement.innerHTML = `<div class="c-cloudcannon-editor-overlay-menu c-cloudcannon-reset"></div>`;
			this.controlsElement.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 99999999999;
      `;
			this.element.append(this.controlsElement);
		}

		if (!this.editButton) {
			this.editButton = document.createElement("button");
			this.editButton.className =
				"c-cloudcannon-reset c-cloudcannon-editor-overlay-menu-control c-cloudcannon-editor-overlay-menu-control-edit";
			this.editButton.innerHTML =
				'<span class="c-cloudcannon-reset cc-control-button-span">Edit</span>';

			this.editButton.onclick = (e: MouseEvent) => {
				window.CloudCannon.edit(this.resolveSource(), undefined, e);
			};

			this.controlsElement.firstElementChild?.append(this.editButton);
		}

		if (!this.dragHandle) {
			this.dragHandle = document.createElement("button");
			this.dragHandle.className =
				"c-cloudcannon-reset c-cloudcannon-editor-overlay-menu-control c-cloudcannon-editor-overlay-menu-control-drag";
			this.dragHandle.innerHTML =
				'<span class="c-cloudcannon-reset cc-control-button-span">Drag</span>';
			this.dragHandle.draggable = true;

			this.dragHandle.ondragstart = (e: DragEvent): void => {
				e.stopPropagation();
				if (e.dataTransfer) {
					e.dataTransfer.setDragImage(this.element, 10, 10);
					e.dataTransfer.effectAllowed = "move";
				}
				this.dragging = true;
				this.element.style.cssText =
					"position: relative; display: block; outline: 1px dashed #034ad8; opacity: 0.5";
				this.element.dispatchEvent(
					new Event("started-drag", { bubbles: true }),
				);
			};

			this.dragHandle.ondragend = (e: DragEvent): void => {
				this.dragging = false;
				this.element.style.cssText =
					"position: relative; display: block; outline: 1px solid #034ad8";
			};

			this.controlsElement.firstElementChild?.append(this.dragHandle);
		}

		this.element.ondragenter = (e: DragEvent): void => {
			if (this.noSwapBack) {
				return;
			}
			e.preventDefault();
			this.element.dispatchEvent(new Event("hovered", { bubbles: true }));
		};

		this.element.ondragover = (e: DragEvent): void => {
			e.preventDefault();
		};

		this.element.ondrop = (e: DragEvent): void => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "move";
			}
			this.element.dispatchEvent(new Event("ended-drag", { bubbles: true }));
		};
	}

	setupListeners(): void {
		super.setupListeners();
		this.parent?.registerListener({ editable: this });
	}
}
