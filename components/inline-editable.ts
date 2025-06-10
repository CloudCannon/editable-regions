import InlineEditable from "../nodes/inline-editable.js";

class InlineEditableComponent extends HTMLElement {
	editable: InlineEditable;

	constructor() {
		super();
		this.editable = new InlineEditable(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("inline-editable", InlineEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"inline-editable": InlineEditableComponent;
	}
}
