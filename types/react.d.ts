/// <reference path="./cloudcannon.d.ts" />

import type { HTMLAttributes, RefAttributes } from "react";
import type {
	EditableArrayComponent,
	EditableArrayItemComponent,
	EditableComponentComponent,
	EditableSourceComponent,
	EditableTextComponent,
} from "../components";

declare module "@cloudcannon/editable-regions/react" {
	export function registerReactComponent(key: string, component: unknown): void;
}

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			"editable-component": RefAttributes<EditableComponentComponent> &
				Omit<HTMLAttributes<EditableComponentComponent>, "className"> & {
					class?: string;
					"data-prop": string;
					"data-component": string;
				};
			"editable-text": RefAttributes<EditableTextComponent> &
				Omit<HTMLAttributes<EditableTextComponent>, "className"> & {
					class?: string;
					"data-prop": string;
					"data-type"?: "block" | "text" | "span";
				};
			"editable-source": RefAttributes<EditableSourceComponent> &
				Omit<HTMLAttributes<EditableSourceComponent>, "className"> & {
					class?: string;
					"data-path": string;
					"data-key": string;
				};
			"editable-array": RefAttributes<EditableArrayComponent> &
				Omit<HTMLAttributes<EditableArrayComponent>, "className"> & {
					class?: string;
					"data-prop": string;
					"data-id-key"?: string;
					"data-component-key"?: string;
					"data-component"?: string;
					"data-direction"?:
						| "column"
						| "row"
						| "column-reverse"
						| "row-reverse";
				};
			"editable-array-item": RefAttributes<EditableArrayItemComponent> &
				Omit<HTMLAttributes<EditableArrayItemComponent>, "className"> & {
					class?: string;
					"data-id"?: string;
					"data-component"?: string;
				};
		}
	}
}
