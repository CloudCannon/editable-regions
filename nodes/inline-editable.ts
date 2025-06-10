import Editable from "./editable.js";

export default class InlineEditable extends Editable {
  update(): void {
    if (this.element.textContent !== this.value) {
      this.element.textContent = String(this.value || '');
    }
  }

  mount(): void {
    this.element.style.cssText = "display: inline-block; outline: 1px solid #034AD8;";
    this.element.contentEditable = "true";

    this.element.onclick = (): void => {
      if (
        this.value &&
        typeof this.value === "string" &&
        this.value !== this.element.textContent
      ) {
        this.element.textContent = this.value;
      }
    };

    this.element.onblur = (): void => {
      const source = this.resolveSource();
      if (!source) {
        throw new Error("Invalid Source: Source not found");
      }
      if (window.CloudCannon) {
        window.CloudCannon.set(source, this.element.textContent || '');
      }
    };
  }
}
