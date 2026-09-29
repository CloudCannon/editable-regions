import { stripDatetimeAnnotations } from "./datetimes.mjs";

/**
 * @typedef {import("@cloudcannon/visual-editor-api").CloudCannonVisualEditorWindow} CloudCannonVisualEditorWindow
 * @typedef {import("@cloudcannon/visual-editor-api").CloudCannonVisualEditorAPIV1} CloudCannonVisualEditorAPIV1
 */

/**
 * @typedef {(props: any) => HTMLElement | Promise<HTMLElement>} ComponentRenderer
 */

/**
 * @typedef {CloudCannonVisualEditorWindow & {
 *   cc_components?: Record<string, ComponentRenderer>;
 *   cc_snippets?: Record<string, ComponentRenderer>;
 * }} ExtendedWindow
 */

/** @type {ExtendedWindow | undefined} */
const extendedWindow = /** @type {any} */ (
	typeof window === "undefined" ? undefined : window
);

/** @type {CloudCannonVisualEditorAPIV1 | undefined} */
let _cloudcannon;

/** @type {Promise<void>} */
export const apiLoadedPromise = new Promise((resolve) => {
	if (extendedWindow?.CloudCannonAPI) {
		_cloudcannon = /** @type {any} */ (
			extendedWindow.CloudCannonAPI.useVersion("v1", true)
		);
		resolve();
	} else if (typeof document !== "undefined") {
		document.addEventListener(
			"cloudcannon:load",
			() => {
				if (extendedWindow?.CloudCannonAPI) {
					_cloudcannon = /** @type {any} */ (
						extendedWindow.CloudCannonAPI.useVersion("v1", true)
					);
				}
				return resolve();
			},
			{ once: true },
		);
	}
});

/**
 * @param {string} key
 * @param {ComponentRenderer} renderer
 */
export const addEditableComponentRenderer = (key, renderer) => {
	if (!extendedWindow) {
		return;
	}
	extendedWindow.cc_components = extendedWindow.cc_components || {};
	extendedWindow.cc_components[key] = renderer;
};

/**
 * @param {string} key
 * @param {ComponentRenderer} renderer
 */
export const addEditableSnippetRenderer = (key, renderer) => {
	if (!extendedWindow) {
		return;
	}
	extendedWindow.cc_snippets = extendedWindow.cc_snippets || {};
	extendedWindow.cc_snippets[key] = renderer;
};

export const getEditableComponentRenderers = () =>
	extendedWindow?.cc_components ?? {};

export const getEditableSnippetRenderers = () =>
	extendedWindow?.cc_snippets ?? {};

/**
 * Resolves CloudCannon API objects (collections, files, datasets) to plain data.
 * @param {unknown} value
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

/**
 * Normalises API data on its way into a renderer. Returns a copy; never use
 * it on data that's written back to the source.
 * @template T
 * @param {T} data
 * @returns {T}
 */
export const toRenderData = (data) => stripDatetimeAnnotations(data);

/**
 * Reads a file's data for rendering (see `toRenderData`).
 * @param {{ data: { get: () => Promise<any> } }} file
 * @returns {Promise<any>}
 */
export const getRenderData = async (file) =>
	toRenderData(await file.data.get());

export const addCustomEditableRegion = (key, region) => {
	if (!extendedWindow || typeof document === "undefined") {
		return;
	}
	extendedWindow.editableRegionMap ??= {};
	extendedWindow.editableRegionMap[key] = region;
	extendedWindow.hydrateDataEditableRegions(document.body);
};

export const getCustomEditableRegions = () => {
	return extendedWindow?.editableRegionMap ?? {};
};

export { _cloudcannon as CloudCannon };
