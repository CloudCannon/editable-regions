import type { WindowType } from "../types/window.js";

import "../helpers/hydrate-editables";

import "./array-editable.js";
import "./array-item.js";
import "./text-editable.js";
import "./component-editable.js";
import "./image-editable.js";
import "./source-editable.js";
import "./snippet-editable.js";

declare const window: WindowType;

Promise.all([
	customElements.whenDefined("array-item"),
	customElements.whenDefined("array-editable"),
	customElements.whenDefined("text-editable"),
	customElements.whenDefined("component-editable"),
	customElements.whenDefined("image-editable"),
	customElements.whenDefined("source-editable"),
	customElements.whenDefined("snippet-editable"),
]).then(() => {
	window.hydrateDataEditables?.(document.body);
});
