/** Emits no code; entries import it for its side effect so declaration emit ships these augmentations. */
import type {
	CloudCannonVisualEditorAPIRouter,
	CloudCannonVisualEditorAPIV0,
	CloudCannonVisualEditorAPIV1,
} from "@cloudcannon/visual-editor-api";
import type Editable from "../nodes/editable.js";
import type * as EditableNodes from "../nodes/index.js";

export type ComponentRenderer = (
	props: any,
) => HTMLElement | Promise<HTMLElement>;

export type EditableRegionConstructor = new (element: HTMLElement) => Editable;

export type EditableRegionsGlobal = {
	Editable: typeof EditableNodes.Editable;
	EditableArray: typeof EditableNodes.EditableArray;
	EditableArrayItem: typeof EditableNodes.EditableArrayItem;
	EditableComponent: typeof EditableNodes.EditableComponent;
	EditableImage: typeof EditableNodes.EditableImage;
	EditableSource: typeof EditableNodes.EditableSource;
	EditableText: typeof EditableNodes.EditableText;
};

declare global {
	var ENV_CLIENT: boolean;
	var inEditorMode: boolean;
	var CloudCannonAPI: CloudCannonVisualEditorAPIRouter | undefined;
	var CloudCannon:
		| CloudCannonVisualEditorAPIV0
		| CloudCannonVisualEditorAPIV1
		| undefined;

	interface Window {
		CloudCannonAPI?: CloudCannonVisualEditorAPIRouter;
		CloudCannon?: CloudCannonVisualEditorAPIV0 | CloudCannonVisualEditorAPIV1;
		cc_components?: Record<string, ComponentRenderer>;
		cc_snippets?: Record<string, ComponentRenderer>;
		editableRegionMap?: Record<string, EditableRegionConstructor>;
		editableRegions?: EditableRegionsGlobal;
		hydrateDataEditableRegions: (root: Element) => void;
	}
}

export {};
