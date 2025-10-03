import EditableImage from "../nodes/editable-image.js";

export default class EditableImageComponent extends HTMLElement {
	editable: EditableImage;

	constructor() {
		super();
		this.editable = new EditableImage(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("editable-image", EditableImageComponent);

declare global {
	interface HTMLElementTagNameMap {
		"editable-image": EditableImageComponent;
	}
}
