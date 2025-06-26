import ImageEditable from "../nodes/image-editable.js";

class ImageEditableComponent extends HTMLElement {
	editable?: ImageEditable;

	connectedCallback(): void {
		const child = this.firstElementChild;
		if (!(child instanceof HTMLImageElement)) {
			throw new Error(
				"ImageEditableComponent must have an image element as its child",
			);
		}
		this.editable = new ImageEditable(child);
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable?.disconnect();
	}
}

customElements.define("image-editable", ImageEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		"image-editable": ImageEditableComponent;
	}
}
