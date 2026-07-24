/// <reference path="./cloudcannon.d.ts" />

import type { HTMLAttributes } from "vue";

export function registerVueComponent(key: string, component: unknown): void;

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
