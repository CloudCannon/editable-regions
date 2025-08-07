import EditableControls from "./editable-controls";

export default class ArrayControls extends EditableControls {
	disableMoveUp = false;
	disableMoveDown = false;
	disableRemove = false;

	private moveUpButton?: HTMLButtonElement;
	private moveDownButton?: HTMLButtonElement;
	private deleteButton?: HTMLButtonElement;

	render(shadow: ShadowRoot): void {
		super.render(shadow);

		this.moveUpButton = document.createElement("button");
		this.moveUpButton.disabled = this.disableMoveUp;
		this.moveUpButton.innerHTML =
			'<cc-icon name="arrow_upward"></cc-icon> Move up';
		this.moveUpButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("move-up", { detail: this }));
		};
		const moveUpContainer = document.createElement("li");
		moveUpContainer.append(this.moveUpButton);
		this.contextMenu?.append(moveUpContainer);

		this.moveDownButton = document.createElement("button");
		this.moveDownButton.disabled = this.disableMoveDown;
		this.moveDownButton.innerHTML =
			'<cc-icon name="arrow_downward"></cc-icon> Move down';
		this.moveDownButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("move-down", { detail: this }));
		};
		const moveDownContainer = document.createElement("li");
		moveDownContainer.append(this.moveDownButton);
		this.contextMenu?.append(moveDownContainer);

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
