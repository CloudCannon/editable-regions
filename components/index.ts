export { default as EditableArrayComponent } from "./editable-array-component.js";
export { default as EditableArrayItemComponent } from "./editable-array-item-component.js";
export { default as EditableComponentComponent } from "./editable-component-component.js";
export { default as EditableImageComponent } from "./editable-image-component.js";
export { default as EditableSnippetComponent } from "./editable-snippet-component.js";
export { default as EditableSourceComponent } from "./editable-source-component.js";
export { default as EditableTextComponent } from "./editable-text-component.js";

import { apiLoadedPromise } from "../helpers/cloudcannon.mjs";
import {
	dehydrateDataEditableRegions,
	hydrateDataEditableRegions,
} from "../helpers/hydrate-editable-regions";
import { completeLoading } from "../helpers/loading.js";

const observer = new MutationObserver((mutations) => {
	mutations.forEach((mutation) => {
		mutation.removedNodes.forEach((el) => {
			if (el instanceof HTMLElement) {
				dehydrateDataEditableRegions(el);
			}
		});

		mutation.addedNodes.forEach((el) => {
			if (el instanceof HTMLElement) {
				hydrateDataEditableRegions(el);
			}
		});
	});
});

hydrateDataEditableRegions(document.body);

observer.observe(document, { childList: true, subtree: true });

Promise.all([
	apiLoadedPromise,
	customElements.whenDefined("editable-array-item"),
	customElements.whenDefined("editable-array"),
	customElements.whenDefined("editable-text"),
	customElements.whenDefined("editable-component"),
	customElements.whenDefined("editable-image"),
	customElements.whenDefined("editable-source"),
	customElements.whenDefined("editable-snippet"),
]).then(() => completeLoading());
