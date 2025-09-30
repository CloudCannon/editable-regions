export {};

declare global {
	var ENV_CLIENT: boolean;
	var inEditorMode: boolean;
	var CloudCannonAPI: CloudCannonJavascriptApiRouter | undefined;
	var CloudCannon:
		| CloudCannonJavaScriptV0API
		| CloudCannonJavaScriptV1API
		| undefined;
}
