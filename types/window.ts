export interface WindowType extends Window {
	cc_components?: Record<string, ComponentRenderer>;
	cc_snippets?: Record<string, ComponentRenderer>;
	hydrateDataEditables: (root: HTMLElement) => void;
}

export type ComponentRenderer = (
	props: any,
) => HTMLElement | Promise<HTMLElement>;
