import ImageEditable from "../nodes/image-editable.js";

class ImageEditableComponent extends HTMLElement {
	editable: ImageEditable;

	constructor() {
		super();
		this.editable = new ImageEditable(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("image-editable", ImageEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"image-editable": ImageEditableComponent;
	}
}
