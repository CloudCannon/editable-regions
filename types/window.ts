export interface WindowType extends Window {
	// TODO use real API types
	CloudCannon?: {
		/** Set a value at the given data path */
		set(path: string, value: any): void;
		/** Move an array item from one index to another */
		moveArrayItem(path: string, fromIndex: number, toIndex: number): void;
		createTextEditableRegion(
			element: HTMLElement,
			onChange: (content?: string) => void,
			options?: {
				elementType?: string;
				editableType?: string;
				inputConfig?: unknown;
			},
		): Promise<{
			setContent: (content: string) => void;
		}>;
		createSourceEditableRegion(
			element: HTMLElement,
			options?: { file?: string; key?: string; elementType?: string },
		): Promise<{
			setContent: (content: string) => void;
		}>;
		edit(slug: string, options?: unknown, e?: Event): void;
		uploadFile(file: File, inputConfig?: unknown): Promise<string | undefined>;
		getInputConfig(slug: string, options?: { path?: string }): Promise<unknown>;
		getFileData(
			slug: string,
			options?: { path?: string; keepMarkdownAsHTML?: boolean },
		): Promise<unknown>;
		setFileData(
			slug: string,
			value: unknown,
			options?: { path?: string; keepMarkdownAsHTML?: boolean },
		): Promise<void>;
		getFileContent(options?: {
			path?: string;
			keepMarkdownAsHTML?: boolean;
		}): Promise<unknown>;
		setFileContent(
			value: string,
			options?: { path?: string; keepMarkdownAsHTML?: boolean },
		): Promise<unknown>;
		getFileSource(options?: { path?: string }): Promise<string>;
		setFileSource(
			value: unknown,
			options?: { path?: string; keepMarkdownAsHTML?: boolean },
		): Promise<void>;
		removeArrayItem(slug: string, index: number): Promise<void>;
		getInputType(key: string | undefined, value?: unknown): string;
		addArrayItem(slug: string, index: number | null, value: any): Promise<void>;
		findStructure(structure: any, value: any): any | undefined;
	};

	cc_components?: Record<string, ComponentRenderer>;
	cc_snippets?: Record<string, ComponentRenderer>;

	hydrateDataEditables?: (root: HTMLElement) => void;
}

export type ComponentRenderer = (
	props: any,
) => HTMLElement | Promise<HTMLElement>;
