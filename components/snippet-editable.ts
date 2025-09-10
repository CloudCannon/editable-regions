import SnippetEditable from "../nodes/snippet-editable.js";

class SnippetEditableComponent extends HTMLElement {
	editable: SnippetEditable;

	constructor() {
		super();
		this.editable = new SnippetEditable(this);
	}

	set snippetData(value: unknown) {
		this.editable.pushValue(value);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("snippet-editable", SnippetEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"snippet-editable": SnippetEditableComponent;
	}
}
