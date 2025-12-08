/// <reference path="./cloudcannon.d.ts" />

import type { HTMLAttributes, RefAttributes } from "react";

export function registerReactComponent(key: string, component: unknown): void;

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			"editable-component": RefAttributes<HTMLElement> &
				Omit<HTMLAttributes<HTMLElement>, "className"> & {
					class?: string;
					"data-prop": string;
					"data-component": string;
				};
			"editable-text": RefAttributes<HTMLElement> &
				Omit<HTMLAttributes<HTMLElement>, "className"> & {
					class?: string;
					"data-prop": string;
					"data-type"?: "block" | "text" | "span";
				};
			"editable-source": RefAttributes<HTMLElement> &
				Omit<HTMLAttributes<HTMLElement>, "className"> & {
					class?: string;
					"data-path": string;
					"data-key": string;
				};
			"editable-array": RefAttributes<HTMLElement> &
				Omit<HTMLAttributes<HTMLElement>, "className"> & {
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
				Omit<HTMLAttributes<HTMLElement>, "className"> & {
					class?: string;
					"data-id"?: string;
					"data-component"?: string;
				};
		}
	}
}
