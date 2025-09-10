import type {
	CloudCannonEditorWindow,
	CloudCannonJavaScriptV1API,
} from "@cloudcannon/javascript-api";

declare const window: CloudCannonEditorWindow;

let _cloudcannon: CloudCannonJavaScriptV1API;

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
