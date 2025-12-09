/**
 * Promise that resolves when the CloudCannon API is loaded
 * @type {Promise<void>}
 */
export const apiLoadedPromise: Promise<void>;
export function addEditableComponentRenderer(key: string, renderer: ComponentRenderer): void;
export function addEditableSnippetRenderer(key: string, renderer: ComponentRenderer): void;
export function getEditableComponentRenderers(): Record<string, ComponentRenderer>;
export function getEditableSnippetRenderers(): Record<string, ComponentRenderer>;
export function realizeAPIValue(value: unknown): Promise<unknown>;
export { _cloudcannon as CloudCannon };
export type CloudCannonEditorWindow = import("@cloudcannon/javascript-api").CloudCannonEditorWindow;
export type CloudCannonJavaScriptV1API = import("@cloudcannon/javascript-api").CloudCannonJavaScriptV1API;
export type ComponentRenderer = (props: any) => HTMLElement | Promise<HTMLElement>;
export type ExtendedWindow = CloudCannonEditorWindow & {
    cc_components?: Record<string, ComponentRenderer>;
    cc_snippets?: Record<string, ComponentRenderer>;
};
/** @type {CloudCannonJavaScriptV1API} */
declare let _cloudcannon: CloudCannonJavaScriptV1API;
