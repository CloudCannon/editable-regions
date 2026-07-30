import type { CloudCannonVisualEditorAPIV1 } from "@cloudcannon/visual-editor-api";

/**
 * Mock CloudCannon API for unit tests. `setup.ts` installs this on
 * `window.CloudCannonAPI`. Test files inject data via the configuration
 * helpers (`setMockFiles`, `setMockCollections`, `resetMock`) in a
 * `beforeAll`/`beforeEach` block. State is module-level and isolated
 * per test file (vitest gives each file its own module registry).
 */

export interface MockFile {
	/** Source path relative to the site root, e.g. `/src/content/blog/first-post.md`. */
	path: string;
	/** Returns parsed front matter / data file contents. */
	data: { get: () => Promise<Record<string, any>> };
	/** Returns the full file contents (front matter + body). */
	get: () => Promise<string>;
	/** Returns file contents via the CC API shape (`file.content.get()`). */
	content: { get: () => Promise<string> };
}

const state = {
	files: [] as MockFile[],
	configuredCollections: new Set<string>(),
	currentFile: null as MockFile | null,
	collectionsList: null as MockCollection[] | null,
};

/** A mock collection that yields items and fires change/delete events. */
export interface MockCollection {
	collectionKey: string;
	items: () => Promise<MockFile[]>;
	addEventListener: (event: string, handler: () => void) => void;
	removeEventListener: (event: string, handler: () => void) => void;
}

/** Replaces the mock file list returned by `CloudCannon.files()`. */
export const setMockFiles = (files: MockFile[]): void => {
	state.files = files;
};

/** Marks which collection keys are "configured" in CloudCannon. Non-configured keys return empty from `collection(key).items()`, triggering the `files()` fallback in the astro:content shim. */
export const setMockCollections = (keys: string[]): void => {
	state.configuredCollections = new Set(keys);
};

/** Resets all mock state to empty. */
export const resetMock = (): void => {
	state.files = [];
	state.configuredCollections.clear();
	state.currentFile = null;
	state.collectionsList = null;
};

/** Sets the file returned by `CloudCannon.currentFile()`. */
export const setMockCurrentFile = (file: MockFile | null): void => {
	state.currentFile = file;
};

/** Sets the collections returned by `CloudCannon.collections()`. */
export const setMockCollectionsList = (
	collections: MockCollection[] | null,
): void => {
	state.collectionsList = collections;
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
		files: () => Promise.resolve(state.files),
		currentFile: () => state.currentFile,
		file: (path: string) =>
			state.files.find((f) => f.path === path || f.path === `/${path}`) ?? null,
		// Used by EditableComponent.realizeAPIValue.
		engage: () => Promise.resolve(),
	}) as any;
