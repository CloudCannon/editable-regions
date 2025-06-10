import ArrayItem from "../nodes/array-item.js";

class ArrayItemComponent extends HTMLElement {
  editable: ArrayItem;

  constructor() {
    super();
    this.editable = new ArrayItem(this);
  }

  connectedCallback(): void {
    this.editable.connect();
  }

  disconnectedCallback(): void {
    this.editable.disconnect();
  }
}

customElements.define("array-item", ArrayItemComponent);