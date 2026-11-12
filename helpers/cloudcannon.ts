import type {
	CloudCannonVisualEditorAPIV1,
	CloudCannonVisualEditorWindow,
} from "@cloudcannon/visual-editor-api";
// Side-effect only: keeps the ambient globals in this module's `.d.ts`.
import "./globals.js";
import type {
	ComponentRenderer,
	EditableRegionConstructor,
} from "./globals.js";

export type {
	ComponentRenderer,
	EditableRegionConstructor,
	EditableRegionsGlobal,
	ExtendedWindow,
} from "./globals.js";
export type { CloudCannonVisualEditorAPIV1, CloudCannonVisualEditorWindow };

const extendedWindow: Window | undefined =
	typeof window === "undefined" ? undefined : window;

let _cloudcannon: CloudCannonVisualEditorAPIV1;

export const apiLoadedPromise: Promise<void> = new Promise((resolve) => {
	if (extendedWindow?.CloudCannonAPI) {
		_cloudcannon = extendedWindow.CloudCannonAPI.useVersion("v1", true);
		resolve();
	} else if (typeof document !== "undefined") {
		document.addEventListener(
			"cloudcannon:load",
			() => {
				if (extendedWindow?.CloudCannonAPI) {
					_cloudcannon = extendedWindow.CloudCannonAPI.useVersion("v1", true);
				}
				return resolve();
			},
			{ once: true },
		);
	}
});

export const addEditableComponentRenderer = (
	key: string,
	renderer: ComponentRenderer,
): void => {
	if (!extendedWindow) {
		return;
	}
	extendedWindow.cc_components = extendedWindow.cc_components || {};
	extendedWindow.cc_components[key] = renderer;
};

export const addEditableSnippetRenderer = (
	key: string,
	renderer: ComponentRenderer,
): void => {
	if (!extendedWindow) {
		return;
	}
	extendedWindow.cc_snippets = extendedWindow.cc_snippets || {};
	extendedWindow.cc_snippets[key] = renderer;
};

export const getEditableComponentRenderers = (): Record<
	string,
	ComponentRenderer
> => extendedWindow?.cc_components ?? {};

export const getEditableSnippetRenderers = (): Record<
	string,
	ComponentRenderer
> => extendedWindow?.cc_snippets ?? {};

/** Resolves API objects (collections, files, datasets) to plain data. */
export const realizeAPIValue = async (value: unknown): Promise<unknown> => {
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

export const addCustomEditableRegion = (
	key: string,
	region: EditableRegionConstructor,
): void => {
	if (!extendedWindow || typeof document === "undefined") {
		return;
	}
	extendedWindow.editableRegionMap ??= {};
	extendedWindow.editableRegionMap[key] = region;
	extendedWindow.hydrateDataEditableRegions?.(document.body);
};

export const getCustomEditableRegions = (): Record<
	string,
	EditableRegionConstructor
> => {
	return extendedWindow?.editableRegionMap ?? {};
};

export { _cloudcannon as CloudCannon };
