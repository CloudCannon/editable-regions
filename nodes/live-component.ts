import Editable from "./editable.js";
import { WindowType } from "../types/window.js";

declare const window: WindowType;

export default class LiveComponent extends Editable {
  update(): void {
    const key = this.element.dataset.component;
    if (!key) {
      throw new Error(`Invalid Component: Component key not provided`);
    }
    const component = window.cc_components?.[key];
    if (!component) {
      throw new Error(`Invalid Component: Component '${key}' not found`);
    }
    component(this.element, this.value);
  }

  mount(): void {
    this.element.style.cssText = "display: inline-block; outline: 1px solid #034AD8;";
  }
}
