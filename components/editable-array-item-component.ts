import EditableArrayItem from "../nodes/editable-array-item.js";

export default class EditableArrayItemComponent extends HTMLElement {
	editable: EditableArrayItem;

	constructor() {
		super();
		this.editable = new EditableArrayItem(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-array-item", EditableArrayItemComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-array-item": EditableArrayItemComponent;
	}
}
