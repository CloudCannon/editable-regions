import type { ArrayDirection } from "../../nodes/editable-array";
import EditableComponentControls from "./editable-component-controls";

export default class EditableArrayItemControls extends EditableComponentControls {
	arrayDirection: ArrayDirection = "column";

	moveBackwardText: "up" | "left" = "up";
	moveForwardText: "down" | "right" = "down";

	private _disableMoveForward = false;
	private _disableMoveBackward = false;
	private _disableRemove = false;
	private _disableReorder = false;

	private moveForwardButton?: HTMLButtonElement;
	private moveBackwardButton?: HTMLButtonElement;
	private deleteButton?: HTMLButtonElement;
	private dragHandle?: HTMLButtonElement;

	set disableMoveForward(value: boolean) {
		this._disableMoveForward = value;
		this.update();
	}

	set disableMoveBackward(value: boolean) {
		this._disableMoveBackward = value;
		this.update();
	}

	set disableRemove(value: boolean) {
		this._disableRemove = value;
		this.update();
	}

	set disableReorder(value: boolean) {
		this._disableReorder = value;
		this.update();
	}

	update() {
		if (this.dragHandle) {
			this.dragHandle.draggable = !this._disableReorder;
			this.dragHandle.innerHTML = `<cc-icon name="${this.dragHandle.draggable ? "drag_indicator" : "more_vert"}"></cc-icon>`;
		}

		if (this.moveForwardButton) {
			this.moveForwardButton.disabled =
				this._disableMoveForward || this._disableReorder;
		}

		if (this.moveBackwardButton) {
			this.moveBackwardButton.disabled =
				this._disableMoveBackward || this._disableReorder;
		}

		if (this.deleteButton) {
			this.deleteButton.disabled = this._disableRemove;
		}
	}

	render(shadow: ShadowRoot): void {
		super.render(shadow);

		this.dragHandle = document.createElement("button");
		this.dragHandle.onclick = (e) => {
			e.stopPropagation();
			if (this.contextMenu?.classList.contains("open")) {
				this.contextMenu?.classList.remove("open");
				this.removeAttribute("open");
			} else if (this.contextMenu && this.contextMenu.childElementCount > 0) {
				this.contextMenu?.classList.add("open");
				this.setAttribute("open", "true");
			}
		};
		this.dragHandle.ondragstart = () => {
			this.contextMenu?.classList.remove("open");
			this.removeAttribute("open");
		};
		this.buttonRow?.append(this.dragHandle);

		const backwardIconName = this.moveBackwardText === "up" ? "north" : "west";
		this.moveBackwardButton = document.createElement("button");
		this.moveBackwardButton.innerHTML = `<cc-icon name="${backwardIconName}"></cc-icon> Move ${this.moveBackwardText}`;
		this.moveBackwardButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("move-backward", { detail: this }));
		};
		const moveBackwardContainer = document.createElement("li");
		moveBackwardContainer.append(this.moveBackwardButton);
		this.contextMenu?.append(moveBackwardContainer);

		const forwardIconName = this.moveForwardText === "down" ? "south" : "east";
		this.moveForwardButton = document.createElement("button");
		this.moveForwardButton.innerHTML = `<cc-icon name="${forwardIconName}"></cc-icon> Move ${this.moveForwardText}`;
		this.moveForwardButton.onclick = (): void => {
			this.dispatchEvent(new CustomEvent("move-forward", { detail: this }));
		};
		const moveForwardContainer = document.createElement("li");
		moveForwardContainer.append(this.moveForwardButton);
		this.contextMenu?.append(moveForwardContainer);

		this.deleteButton = document.createElement("button");
		this.deleteButton.innerHTML = '<cc-icon name="delete"></cc-icon> Delete';
		this.deleteButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("delete", { detail: this }));
		};
		const deleteContainer = document.createElement("li");
		deleteContainer.append(this.deleteButton);
		this.contextMenu?.append(deleteContainer);

		this.update();
	}
}

customElements.define(
	"editable-array-item-controls",
	EditableArrayItemControls,
);

declare global {
	interface HTMLElementTagNameMap {
		"editable-array-item-controls": EditableArrayItemControls;
	}
}
