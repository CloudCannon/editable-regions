export {};

declare global {
	var ENV_CLIENT: boolean;
	var inEditorMode: boolean;
	var CloudCannonAPI: CloudCannonVisualEditorAPIRouter | undefined;
	var CloudCannon:
		| CloudCannonVisualEditorAPIV0
		| CloudCannonVisualEditorAPIV1
		| undefined;
}
