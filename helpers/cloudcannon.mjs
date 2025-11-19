/**
 * @typedef {import("@cloudcannon/javascript-api").CloudCannonEditorWindow} CloudCannonEditorWindow
 * @typedef {import("@cloudcannon/javascript-api").CloudCannonJavaScriptV1API} CloudCannonJavaScriptV1API
 */

/**
 * @typedef {(props: any) => HTMLElement | Promise<HTMLElement>} ComponentRenderer
 */

/**
 * @typedef {CloudCannonEditorWindow & {
 *   cc_components?: Record<string, ComponentRenderer>;
 *   cc_snippets?: Record<string, ComponentRenderer>;
 * }} ExtendedWindow
 */

/** @type {ExtendedWindow} */
const extendedWindow = /** @type {any} */ (window);

/** @type {CloudCannonJavaScriptV1API} */
let _cloudcannon;

/**
 * Promise that resolves when the CloudCannon API is loaded
 * @type {Promise<void>}
 */
export const apiLoadedPromise = new Promise((resolve) => {
	if (extendedWindow.CloudCannonAPI) {
		_cloudcannon = /** @type {any} */ (extendedWindow.CloudCannonAPI.useVersion("v1", true));
		resolve();
	} else {
		document.addEventListener(
			"cloudcannon:load",
			() => {
				if (extendedWindow.CloudCannonAPI) {
					_cloudcannon = /** @type {any} */ (extendedWindow.CloudCannonAPI.useVersion("v1", true));
				}
				return resolve();
			},
			{ once: true },
		);
	}
});

/**
 * Add a renderer for editable components
 * @param {string} key - The component key
 * @param {ComponentRenderer} renderer - The component renderer function
 * @returns {void}
 */
export const addEditableComponentRenderer = (key, renderer) => {
	extendedWindow.cc_components = extendedWindow.cc_components || {};
	extendedWindow.cc_components[key] = renderer;
	document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
};

/**
 * Add a renderer for editable snippets
 * @param {string} key - The snippet key
 * @param {ComponentRenderer} renderer - The snippet renderer function
 * @returns {void}
 */
export const addEditableSnippetRenderer = (key, renderer) => {
	extendedWindow.cc_snippets = extendedWindow.cc_snippets || {};
	extendedWindow.cc_snippets[key] = renderer;
	document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
};

/**
 * Get all registered editable component renderers
 * @returns {Record<string, ComponentRenderer>}
 */
export const getEditableComponentRenderers = () => extendedWindow.cc_components ?? {};

/**
 * Get all registered editable snippet renderers
 * @returns {Record<string, ComponentRenderer>}
 */
export const getEditableSnippetRenderers = () => extendedWindow.cc_snippets ?? {};

/**
 * Realize API values by converting CloudCannon API objects to their data representations
 * @param {unknown} value - The value to realize
 * @returns {Promise<unknown>}
 */
export const realizeAPIValue = async (value) => {
	if (_cloudcannon.isAPICollection(value)) {
		const items = await value.items();
		return Promise.all(items.map(realizeAPIValue));
	}
	if (_cloudcannon.isAPIFile(value)) {
		return value.data.get();
	}
	if (_cloudcannon.isAPIDataset(value)) {
		const items = await value.items();
		if (Array.isArray(items)) {
			return Promise.all(items.map(realizeAPIValue));
		}
		return items.data.get();
	}
	return value;
};

export { _cloudcannon as CloudCannon };
