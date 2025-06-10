import type { WindowType } from "../types/window.js";

import "../helpers/hydrate-editables";

import "./array-editable.js";
import "./array-item.js";
import "./block-editable.js";
import "./inline-editable.js";
import "./live-component.js";

declare const window: WindowType;

await Promise.all([
	customElements.whenDefined("array-item"),
	customElements.whenDefined("array-editable"),
	customElements.whenDefined("inline-editable"),
	customElements.whenDefined("block-editable"),
	customElements.whenDefined("live-component"),
]);

window.hydrateDataEditables?.(document.body);
