/// <reference path="./cloudcannon.d.ts" />

import type { FC, HTMLAttributes, RefAttributes } from "react";

export function registerReactComponent(key: string, component: unknown): void;

export const EditableRegions: FC<
	HTMLAttributes<HTMLElement> & {
		tag?: string;
	}
>;

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			"editable-component": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop": string;
					"data-component": string;
				};
			"editable-text": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop": string;
					"data-type"?: "block" | "text" | "span";
				};
			"editable-source": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-path": string;
					"data-key": string;
				};
			"editable-array": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
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
			"editable-array-item": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-id"?: string;
					"data-component"?: string;
				};
			"editable-image": RefAttributes<HTMLElement> &
				HTMLAttributes<HTMLElement> & {
					class?: string;
					"data-prop"?: string;
					"data-prop-src"?: string;
					"data-prop-alt"?: string;
					"data-prop-title"?: string;
				};
		}
	}
}
