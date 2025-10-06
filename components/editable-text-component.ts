import EditableText from "../nodes/editable-text.js";

export default class EditableTextComponent extends HTMLElement {
	editable: EditableText;

	constructor() {
		super();
		this.editable = new EditableText(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-text", EditableTextComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-text": EditableTextComponent;
	}
}
