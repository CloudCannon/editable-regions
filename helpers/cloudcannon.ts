import type {
	CloudCannonEditorWindow,
	CloudCannonJavaScriptV1API,
} from "@cloudcannon/javascript-api";

export type ComponentRenderer = (
	props: any,
) => HTMLElement | Promise<HTMLElement>;

declare const window: CloudCannonEditorWindow & {
	cc_components?: Record<string, ComponentRenderer>;
	cc_snippets?: Record<string, ComponentRenderer>;
};

let _cloudcannon: CloudCannonJavaScriptV1API;

export const apiLoadedPromise = new Promise<void>((resolve) => {
	if (window.CloudCannonAPI) {
		_cloudcannon = window.CloudCannonAPI.useVersion("v1", true) as any;
		resolve();
	} else {
		document.addEventListener(
			"cloudcannon:load",
			() => {
				if (window.CloudCannonAPI) {
					_cloudcannon = window.CloudCannonAPI.useVersion("v1", true) as any;
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
) => {
	window.cc_components = window.cc_components || {};
	window.cc_components[key] = renderer;
	document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
};

export const addEditableSnippetRenderer = (
	key: string,
	renderer: ComponentRenderer,
) => {
	window.cc_snippets = window.cc_snippets || {};
	window.cc_snippets[key] = renderer;
	document.dispatchEvent(new CustomEvent(`editable-regions:registered-${key}`));
};

export const getEditableComponentRenderers = () => window.cc_components ?? {};
export const getEditableSnippetRenderers = () => window.cc_snippets ?? {};

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

export { _cloudcannon as CloudCannon };
