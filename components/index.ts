export { default as EditableArrayComponent } from "./editable-array-component.js";
export { default as EditableArrayItemComponent } from "./editable-array-item-component.js";
export { default as EditableTextComponent } from "./editable-text-component.js";
export { default as EditableComponentComponent } from "./editable-component-component.js";
export { default as EditableImageComponent } from "./editable-image-component.js";
export { default as EditableSourceComponent } from "./editable-source-component.js";
export { default as EditableSnippetComponent } from "./editable-snippet-component.js";

import { loadedPromise } from "../helpers/cloudcannon.js";
import {
	dehydrateDataEditableRegions,
	hydrateDataEditableRegions,
} from "../helpers/hydrate-editable-regions";

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

observer.observe(document, { childList: true, subtree: true });

loadedPromise.then(() => {
	hydrateDataEditableRegions(document.body);
});
