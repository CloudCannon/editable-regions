import EditableSnippet from "../nodes/editable-snippet.js";

export default class EditableSnippetComponent extends HTMLElement {
	editable: EditableSnippet;

	constructor() {
		super();
		this.editable = new EditableSnippet(this);
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

customElements.define("editable-snippet", EditableSnippetComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-snippet": EditableSnippetComponent;
	}
}
