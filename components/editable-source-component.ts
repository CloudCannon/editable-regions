import EditableSource from "../nodes/editable-source.js";

export default class EditableComponentSource extends HTMLElement {
	editable: EditableSource;

	constructor() {
		super();
		this.editable = new EditableSource(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-source", EditableComponentSource);

declare global {
	interface HTMLElementTagNameMap {
		"editable-source": EditableComponentSource;
	}
}
