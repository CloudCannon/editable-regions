import TextEditable from "../nodes/text-editable.js";

class TextEditableComponent extends HTMLElement {
	editable: TextEditable;

	constructor() {
		super();
		this.editable = new TextEditable(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("text-editable", TextEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"text-editable": TextEditableComponent;
	}
}
