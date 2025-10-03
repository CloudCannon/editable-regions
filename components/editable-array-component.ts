import EditableArray from "../nodes/editable-array.js";

export default class EditableArrayComponent extends HTMLElement {
	editable: EditableArray;

	constructor() {
		super();
		this.editable = new EditableArray(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-array", EditableArrayComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-array": EditableArrayComponent;
	}
}
