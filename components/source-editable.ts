import SourceEditable from "../nodes/source-editable.js";

class SourceEditableComponent extends HTMLElement {
	editable: SourceEditable;

	constructor() {
		super();
		this.editable = new SourceEditable(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("source-editable", SourceEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"source-editable": SourceEditableComponent;
	}
}
