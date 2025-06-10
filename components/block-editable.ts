import BlockEditable from "../nodes/block-editable.js";

class BlockEditableComponent extends HTMLElement {
  editable: BlockEditable;

  constructor() {
    super();
    this.editable = new BlockEditable(this);
  }

  connectedCallback(): void {
    this.editable.connect();
  }

  disconnectedCallback(): void {
    this.editable.disconnect();
  }
}

customElements.define("block-editable", BlockEditableComponent);

declare global {
	interface HTMLElementTagNameMap {
		'block-editable': BlockEditableComponent;
	}
}
