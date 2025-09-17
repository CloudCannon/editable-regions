import "./editable-array-component.js";
import "./editable-array-item-component.js";
import "./editable-text-component.js";
import "./editable-component-component.js";
import "./editable-image-component.js";
import "./editable-source-component.js";
import "./editable-snippet-component.js";
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
