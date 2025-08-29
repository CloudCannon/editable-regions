import type { CloudCannonEditorWindow } from "@cloudcannon/javascript-api";

declare const window: CloudCannonEditorWindow;

await new Promise<void>((resolve) => {
	if (window.CloudCannon) {
		resolve();
	} else {
		document.addEventListener("cloudcannon:load", resolve, { once: true });
	}
});

if (!window.CloudCannonAPI) {
	throw new Error("Failed to load CloudCannon API");
}

export default window.CloudCannonAPI.useVersion("v1");
