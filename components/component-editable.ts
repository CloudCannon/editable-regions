import ComponentEditable from "../nodes/component-editable.js";

class ComponentEditableComponent extends HTMLElement {
	editable: ComponentEditable;

	constructor() {
		super();
		this.editable = new ComponentEditable(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("component-editable", ComponentEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"component-editable": ComponentEditableComponent;
	}
}
