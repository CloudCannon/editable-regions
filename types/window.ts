export interface WindowType extends Window {
	// TODO use real API types
	CloudCannon?: {
		/** Set a value at the given data path */
		set(path: string, value: any): void;
		/** Move an array item from one index to another */
		moveArrayItem(path: string, fromIndex: number, toIndex: number): void;
	};

	cc_components?: Record<string, ComponentRenderer>;
}

export type ComponentRenderer = (
	target: HTMLElement,
	props: any,
) => void | Promise<void>;
