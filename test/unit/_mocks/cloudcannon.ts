import type { CloudCannonVisualEditorAPIV1 } from "@cloudcannon/visual-editor-api";

export interface MockFile {
	path: string;
	data: { get: () => Promise<Record<string, any>> };
	get: () => Promise<string>;
	content: { get: () => Promise<string> };
	getInputConfig?: (options: { slug?: string }) => Promise<any>;
}

const state = {
	files: [] as MockFile[],
	configuredCollections: new Set<string>(),
	currentFile: null as MockFile | null,
	collectionsList: null as MockCollection[] | null,
	datasetsList: null as MockDataset[] | null,
	customDataPanels: [] as any[],
};

const siteListeners: Record<string, Set<(event: any) => void>> = {
	change: new Set(),
	delete: new Set(),
};

export interface MockCollection {
	collectionKey: string;
	items: () => Promise<MockFile[]>;
	addEventListener: (event: string, handler: (event: any) => void) => void;
	removeEventListener: (event: string, handler: (event: any) => void) => void;
	emit?: (event: "change" | "delete", sourcePath: string) => void;
}

export interface MockDataset {
	datasetKey: string;
	items: () => Promise<MockFile | MockFile[]>;
	addEventListener: (event: string, handler: (event: any) => void) => void;
	removeEventListener: (event: string, handler: (event: any) => void) => void;
	emit?: (event: "change" | "delete", sourcePath: string) => void;
}

/** Owns its own listeners, so emitting fires only on this collection. */
export const makeMockCollection = (
	key: string,
	files: MockFile[],
): MockCollection & Required<Pick<MockCollection, "emit">> => {
	const listeners: Record<string, Set<(event: any) => void>> = {
		change: new Set(),
		delete: new Set(),
	};
	return {
		collectionKey: key,
		items: () => Promise.resolve(files),
		addEventListener: (event, handler) => {
			listeners[event]?.add(handler);
		},
		removeEventListener: (event, handler) => {
			listeners[event]?.delete(handler);
		},
		emit: (event, sourcePath) => {
			for (const handler of listeners[event] ?? []) {
				handler({ detail: { sourcePath } });
			}
		},
	};
};

export const makeMockDataset = (
	key: string,
	fileOrFiles: MockFile | MockFile[],
): MockDataset & Required<Pick<MockDataset, "emit">> => {
	const listeners: Record<string, Set<(event: any) => void>> = {
		change: new Set(),
		delete: new Set(),
	};
	return {
		datasetKey: key,
		items: () => Promise.resolve(fileOrFiles),
		addEventListener: (event, handler) => {
			listeners[event]?.add(handler);
		},
		removeEventListener: (event, handler) => {
			listeners[event]?.delete(handler);
		},
		emit: (event, sourcePath) => {
			for (const handler of listeners[event] ?? []) {
				handler({ detail: { sourcePath } });
			}
		},
	};
};

export const setMockFiles = (files: MockFile[]): void => {
	state.files = files;
};

/** Non-configured keys return empty items(), triggering the `files()` fallback. */
export const setMockCollections = (keys: string[]): void => {
	state.configuredCollections = new Set(keys);
};

export const resetMock = (): void => {
	state.files = [];
	state.configuredCollections.clear();
	state.currentFile = null;
	state.collectionsList = null;
	state.datasetsList = null;
	state.customDataPanels = [];
	siteListeners.change.clear();
	siteListeners.delete.clear();
};

export const getMockCustomDataPanels = (): any[] => state.customDataPanels;

/** Async handler work lands a microtask later — assert with `vi.waitFor`. */
export const emitMockApiChange = (
	sourcePath: string,
	options: { isNew?: boolean } = {},
): void => {
	for (const handler of siteListeners.change) {
		handler({ detail: { sourcePath, isNew: options.isNew ?? false } });
	}
};

export const emitMockApiDelete = (sourcePath: string): void => {
	for (const handler of siteListeners.delete) {
		handler({ detail: { sourcePath, isNew: false } });
	}
};

export const setMockCurrentFile = (file: MockFile | null): void => {
	state.currentFile = file;
};

export const setMockCollectionsList = (
	collections: MockCollection[] | null,
): void => {
	state.collectionsList = collections;
};

export const setMockDatasetsList = (datasets: MockDataset[] | null): void => {
	state.datasetsList = datasets;
};

export const createMockApi = (): CloudCannonVisualEditorAPIV1 =>
	({
		isAPICollection: (value: unknown): value is any =>
			value !== null &&
			typeof value === "object" &&
			(value as any).__kind === "collection",
		isAPIFile: (value: unknown): value is any =>
			value !== null &&
			typeof value === "object" &&
			(value as any).__kind === "file",
		isAPIDataset: (value: unknown): value is any =>
			value !== null &&
			typeof value === "object" &&
			(value as any).__kind === "dataset",
		collection: (key: string) => ({
			collectionKey: key,
			items: () =>
				Promise.resolve(
					state.configuredCollections.has(key)
						? state.files.filter((f) =>
								f.path.startsWith(`/src/content/${key}/`),
							)
						: [],
				),
		}),
		collections: () => Promise.resolve(state.collectionsList ?? []),
		datasets: () => Promise.resolve(state.datasetsList ?? []),
		files: () => Promise.resolve(state.files),
		currentFile: () => {
			if (state.currentFile === null) {
				throw new Error("No current file path");
			}
			return state.currentFile;
		},
		file: (path: string) =>
			state.files.find((f) => f.path === path || f.path === `/${path}`) ?? null,
		addEventListener: (event: string, handler: any) => {
			siteListeners[event]?.add(handler);
		},
		removeEventListener: (event: string, handler: any) => {
			siteListeners[event]?.delete(handler);
		},
		engage: () => Promise.resolve(),
		getPreviewUrl: (src: string) => Promise.resolve(src),
		createCustomDataPanel: (options: any) => {
			state.customDataPanels.push(options);
			return Promise.resolve(`panel-${state.customDataPanels.length}`);
		},
		destroyCustomDataPanel: () => undefined,
	}) as any;
