import type { ArrayDirection } from "../../nodes/array-editable";
import EditableControls from "./editable-controls";

export default class ArrayControls extends EditableControls {
	disableMoveForward = false;
	disableMoveBackward = false;
	disableRemove = false;
	disableReorder = false;
	arrayDirection: ArrayDirection = "column";

	moveBackwardText: "up" | "left" = "up";
	moveForwardText: "down" | "right" = "down";

	private moveForwardButton?: HTMLButtonElement;
	private moveBackwardButton?: HTMLButtonElement;
	private deleteButton?: HTMLButtonElement;
	private dragHandle?: HTMLButtonElement;

	render(shadow: ShadowRoot): void {
		super.render(shadow);

		this.dragHandle = document.createElement("button");
		this.dragHandle.draggable = !this.disableReorder;
		this.dragHandle.innerHTML = `<cc-icon name="${this.dragHandle.draggable ? "drag_indicator" : "more_vert"}"></cc-icon>`;
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
		this.moveBackwardButton.disabled =
			this.disableMoveBackward || this.disableReorder;
		this.moveBackwardButton.innerHTML = `<cc-icon name="${backwardIconName}"></cc-icon> Move ${this.moveBackwardText}`;
		this.moveBackwardButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("move-backward", { detail: this }));
		};
		const moveBackwardContainer = document.createElement("li");
		moveBackwardContainer.append(this.moveBackwardButton);
		this.contextMenu?.append(moveBackwardContainer);

		const forwardIconName = this.moveForwardText === "down" ? "south" : "east";
		this.moveForwardButton = document.createElement("button");
		this.moveForwardButton.disabled =
			this.disableMoveForward || this.disableReorder;
		this.moveForwardButton.innerHTML = `<cc-icon name="${forwardIconName}"></cc-icon> Move ${this.moveForwardText}`;
		this.moveForwardButton.onclick = (): void => {
			this.dispatchEvent(new CustomEvent("move-forward", { detail: this }));
		};
		const moveForwardContainer = document.createElement("li");
		moveForwardContainer.append(this.moveForwardButton);
		this.contextMenu?.append(moveForwardContainer);

		this.deleteButton = document.createElement("button");
		this.deleteButton.disabled = this.disableRemove;
		this.deleteButton.innerHTML = '<cc-icon name="delete"></cc-icon> Delete';
		this.deleteButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("delete", { detail: this }));
		};
		const deleteContainer = document.createElement("li");
		deleteContainer.append(this.deleteButton);
		this.contextMenu?.append(deleteContainer);
	}
}

customElements.define("array-controls", ArrayControls);

declare global {
	interface HTMLElementTagNameMap {
		"array-controls": ArrayControls;
	}
}
