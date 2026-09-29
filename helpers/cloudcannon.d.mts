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
export function toRenderData<T>(data: T): T;
export function getRenderData(file: {
    data: {
        get: () => Promise<any>;
    };
}): Promise<any>;
export { _cloudcannon as CloudCannon };
export type CloudCannonVisualEditorWindow = import("@cloudcannon/visual-editor-api").CloudCannonVisualEditorWindow;
export type CloudCannonVisualEditorAPIV1 = import("@cloudcannon/visual-editor-api").CloudCannonVisualEditorAPIV1;
export type ComponentRenderer = (props: any) => HTMLElement | Promise<HTMLElement>;
export type ExtendedWindow = CloudCannonVisualEditorWindow & {
    cc_components?: Record<string, ComponentRenderer>;
    cc_snippets?: Record<string, ComponentRenderer>;
};
/** @type {CloudCannonVisualEditorAPIV1} */
declare let _cloudcannon: CloudCannonVisualEditorAPIV1;
