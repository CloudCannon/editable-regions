/**
 * Mount gating. An editable node must not mount before its parent editable
 * node has mounted. Absolute data paths (`@file[...]`, `@data[...]`,
 * `@collections[...]`) subscribe to API objects directly and resolve their
 * first value without any parent push, so without the gate they would mount
 * and mutate the DOM mid-hydration in frameworks like Nuxt.
 */

import { beforeEach, expect, test, vi } from "vitest";

import { CloudCannon } from "../../../helpers/cloudcannon.mjs";
import { Editable, EditableText } from "../../../nodes";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	resetMock,
	setMockCurrentFile,
	setMockFiles,
} from "../_mocks/cloudcannon";

const ABOUT_PATH = "/src/pages/about.md";

const makeListenedFile = (path: string, data: unknown): MockFile => {
	const listeners: Record<string, Set<(event: any) => void>> = {
		change: new Set(),
		delete: new Set(),
	};
	const file: MockFile = {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("body") },
		getInputConfig: async () => ({ label: "Title" }),
	};
	Object.assign(file, {
		__kind: "file",
		addEventListener: (event: string, handler: (event: any) => void) => {
			listeners[event]?.add(handler);
		},
		removeEventListener: (event: string, handler: (event: any) => void) => {
			listeners[event]?.delete(handler);
		},
		emit: (event: string, sourcePath: string) => {
			for (const handler of listeners[event] ?? []) {
				handler({ detail: { sourcePath } });
			}
		},
	});
	return file;
};

beforeEach(() => {
	resetMock();
	(CloudCannon as any).createTextEditableRegion = async () => ({
		setContent: () => undefined,
		destroy: () => undefined,
	});
	setMockFiles([makeListenedFile(ABOUT_PATH, { title: "About" })]);
	setMockCurrentFile({
		path: "/src/pages/index.md",
		data: { get: () => Promise.resolve({}) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
		__kind: "file",
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	} as MockFile);
});

const textChild = (prop: string) => {
	const el = document.createElement("p");
	el.dataset.editable = "text";
	el.dataset.prop = prop;
	return new EditableText(el);
};

test("defers an absolute-path child until its pending parent mounts", async () => {
	document.body.innerHTML = `
		<div id="root" data-editable="_dynamic" data-prop="@file[${ABOUT_PATH}].title"></div>
	`;

	const child = textChild(`@file[${ABOUT_PATH}].title`);
	document.getElementById("root")?.append(child.element);
	child.connect();

	await vi.waitFor(() => expect(child.element.isConnected).toBe(true));
	expect(child.mounted).toBe(false);
	expect(child.value).toBeUndefined();

	const root = new Editable(document.getElementById("root") as HTMLElement);
	root.connect();

	await vi.waitFor(() => expect(child.mounted).toBe(true));
	expect(root.mounted).toBe(true);
	expect(child.value).toBe("About");
});

test("an external API event does not mount the deferred child", async () => {
	document.body.innerHTML = `
		<div id="root" data-editable="_dynamic" data-prop="@file[${ABOUT_PATH}].title"></div>
	`;

	const child = textChild(`@file[${ABOUT_PATH}].title`);
	document.getElementById("root")?.append(child.element);
	child.connect();

	const file = (CloudCannon as any).file(ABOUT_PATH);
	file.emit("change", ABOUT_PATH);
	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(child.mounted).toBe(false);

	const root = new Editable(document.getElementById("root") as HTMLElement);
	root.connect();

	await vi.waitFor(() => expect(child.mounted).toBe(true));
});

test("a top-level child with no editable ancestor still mounts immediately", async () => {
	const child = textChild(`@file[${ABOUT_PATH}].title`);
	document.body.append(child.element);
	child.connect();

	await vi.waitFor(() => expect(child.mounted).toBe(true));
	expect(child.value).toBe("About");
});

test("a child under a valueless parent stays unmounted", async () => {
	document.body.innerHTML = `<div id="root" data-editable="_dynamic"></div>`;

	const child = textChild(`@file[${ABOUT_PATH}].title`);
	document.getElementById("root")?.append(child.element);
	child.connect();

	const root = new Editable(document.getElementById("root") as HTMLElement);
	root.connect();

	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(root.mounted).toBe(false);
	expect(child.mounted).toBe(false);
});
