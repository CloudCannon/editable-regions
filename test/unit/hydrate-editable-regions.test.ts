import { beforeEach, expect, test, vi } from "vitest";

import {
	dehydrateDataEditableRegions,
	hydrateDataEditableRegions,
} from "../../helpers/hydrate-editable-regions";
import Editable, { hasEditable } from "../../nodes/editable.js";
import type { MockFile } from "../_mocks/cloudcannon";
import { setMockCurrentFile } from "./_mocks/cloudcannon";

beforeEach(() => {
	const file: MockFile = {
		path: "/src/pages/index.md",
		data: { get: () => Promise.resolve({}) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
	Object.assign(file, {
		__kind: "file",
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	});
	setMockCurrentFile(file);

	document.body.innerHTML = `
		<div id="dynamic-root" data-editable="_dynamic">
			<p id="text" data-editable="text" data-prop="title">Hello</p>
			<div id="broken" data-editable="bogus">Bad</div>
		</div>
		<div id="plain" data-editable="text" data-prop="other">Plain</div>
	`;
});

const get = (id: string) => document.getElementById(id) as HTMLElement | null;

test("hydrate skips _dynamic elements instead of erroring", () => {
	hydrateDataEditableRegions(document.body);

	const root = get("dynamic-root");
	expect(root?.outerHTML).toMatch(/^<div id="dynamic-root"/);
	expect(hasEditable(root as HTMLElement)).toBe(false);
});

test("hydrate still hydrates descendants of a _dynamic root", () => {
	hydrateDataEditableRegions(document.body);

	expect(hasEditable(get("text") as HTMLElement)).toBe(true);
	expect(hasEditable(get("plain") as HTMLElement)).toBe(true);
});

test("hydrate replaces unknown editable types with an error card", () => {
	hydrateDataEditableRegions(document.body);

	expect(document.getElementById("broken")).toBeNull();
	expect(document.querySelector("editable-region-error-card")).not.toBeNull();
});

test("dehydrate leaves _dynamic elements to the component that owns them", async () => {
	hydrateDataEditableRegions(document.body);

	const root = get("dynamic-root") as HTMLElement;
	const owned = new Editable(root);
	root.editable = owned;
	owned.connect();
	await vi.waitFor(() => expect(owned.connected).toBe(true));

	dehydrateDataEditableRegions(document.body);

	expect(owned.connected).toBe(true);

	const plain = get("plain") as HTMLElement & { editable: Editable };
	await vi.waitFor(() => expect(plain.editable.connected).toBe(false));
});

test("exposes the editable node classes globally", () => {
	const regions = (window as any).editableRegions;
	expect(regions.Editable).toBe(Editable);
	for (const key of [
		"EditableArray",
		"EditableArrayItem",
		"EditableComponent",
		"EditableImage",
		"EditableSource",
		"EditableText",
	]) {
		expect(regions[key], key).toBeDefined();
	}
});
