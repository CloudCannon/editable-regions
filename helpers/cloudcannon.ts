import type {
	CloudCannonEditorWindow,
	CloudCannonJavaScriptV1API,
	CloudCannonJavaScriptV1APICollection,
	CloudCannonJavaScriptV1APIFile,
} from "@cloudcannon/javascript-api";

declare const window: CloudCannonEditorWindow;

let _cloudcannon: CloudCannonJavaScriptV1API & {
	isAPIFile(obj: unknown): obj is CloudCannonJavaScriptV1APIFile;
	isAPICollection(obj: unknown): obj is CloudCannonJavaScriptV1APICollection;
};

export const loadedPromise = new Promise<void>((resolve) => {
	if (window.CloudCannonAPI) {
		_cloudcannon = window.CloudCannonAPI.useVersion("v1") as any;
		resolve();
	} else {
		document.addEventListener(
			"cloudcannon:load",
			() => {
				if (window.CloudCannonAPI) {
					_cloudcannon = window.CloudCannonAPI.useVersion("v1") as any;
				}
				return resolve();
			},
			{ once: true },
		);
	}
});

export { _cloudcannon as CloudCannon };
