import EditableControls from "./editable-controls";

export default class ArrayControls extends EditableControls {
	private dragHandle?: HTMLButtonElement;

	render(shadow: ShadowRoot) {
		super.render(shadow);

		this.dragHandle = document.createElement("button");
		this.dragHandle.draggable = true;
		this.dragHandle.innerHTML = '<cc-icon name="drag_indicator"></cc-icon>';
		shadow.append(this.dragHandle);
	}
}

customElements.define("array-controls", ArrayControls);

declare global {
	interface HTMLElementTagNameMap {
		"array-controls": ArrayControls;
	}
}
