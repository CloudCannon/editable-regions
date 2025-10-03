import EditableComponent from "../nodes/editable-component.js";

export default class EditableComponentComponent extends HTMLElement {
	editable: EditableComponent;

	constructor() {
		super();
		this.editable = new EditableComponent(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-component", EditableComponentComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-component": EditableComponentComponent;
	}
}
