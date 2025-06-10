import ArrayEditable from "../nodes/array-editable.js";

class ArrayEditableComponent extends HTMLElement {
  editable: ArrayEditable;

  constructor() {
    super();
    this.editable = new ArrayEditable(this);
  }

  connectedCallback(): void {
    this.editable.connect();
  }

  disconnectedCallback(): void {
    this.editable.disconnect();
  }
}

customElements.define("array-editable", ArrayEditableComponent);