/// <reference path="./cloudcannon.d.ts" />

import type { DefineComponent, HTMLAttributes } from "vue";

export function registerVueComponent(key: string, component: unknown): void;

export const EditableRegions: DefineComponent<
	Omit<HTMLAttributes, "data-prop"> & {
		tag?: string;
	}
>;

declare global {
	namespace JSX {
		interface IntrinsicElements {
			"editable-component": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-component": string;
			};
			"editable-text": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-type"?: "block" | "text" | "span";
			};
			"editable-image": HTMLAttributes & {
				class?: string;
				"data-prop"?: string;
				"data-prop-src"?: string;
				"data-prop-alt"?: string;
				"data-prop-title"?: string;
			};
			"editable-source": HTMLAttributes & {
				class?: string;
				"data-path": string;
				"data-key": string;
			};
			"editable-array": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-id-key"?: string;
				"data-component-key"?: string;
				"data-component"?: string;
				"data-direction"?: "column" | "row" | "column-reverse" | "row-reverse";
			};
			"editable-array-item": HTMLAttributes & {
				class?: string;
				"data-id"?: string;
				"data-component"?: string;
			};
		}
	}
}
