import "../helpers/hydrate-editables";

import "./array-editable.js";
import "./array-item.js";
import "./text-editable.js";
import "./component-editable.js";
import "./image-editable.js";
import "./source-editable.js";
import "./snippet-editable.js";
import { loadedPromise } from "../helpers/cloudcannon.js";
import {
	dehydrateDataEditables,
	hydrateDataEditables,
} from "../helpers/hydrate-editables";

const observer = new MutationObserver((mutations) => {
	mutations.forEach((mutation) => {
		mutation.removedNodes.forEach((el) => {
			if (el instanceof HTMLElement) {
				dehydrateDataEditables(el);
			}
		});

		mutation.addedNodes.forEach((el) => {
			if (el instanceof HTMLElement) {
				hydrateDataEditables(el);
			}
		});
	});
});

observer.observe(document, { childList: true, subtree: true });

Promise.all([
	customElements.whenDefined("array-item"),
	customElements.whenDefined("array-editable"),
	customElements.whenDefined("text-editable"),
	customElements.whenDefined("component-editable"),
	customElements.whenDefined("image-editable"),
	customElements.whenDefined("source-editable"),
	customElements.whenDefined("snippet-editable"),
	loadedPromise,
]).then(() => {
	hydrateDataEditables(document.body);
});
