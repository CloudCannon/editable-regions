/**
 * EditableSource validation and input config. Source regions read their
 * options from HTML attributes: `data-path`/`data-key` are required, and the
 * editor's input config comes from either inline `data-input-config` JSON or a
 * `data-input` slug resolved through the API. The validation methods are
 * exercised directly (they don't need the region connected).
 */

import { beforeEach, expect, test } from "vitest";

import { CloudCannon } from "../../../helpers/cloudcannon.mjs";
import EditableSource from "../../../nodes/editable-source.js";
import type { MockFile } from "../_mocks/cloudcannon";
import { resetMock } from "../_mocks/cloudcannon";

/** A detached-but-attached source region element with the given dataset. */
function sourceElement(dataset: Record<string, string>): HTMLElement {
	const el = document.createElement("div");
	for (const [key, value] of Object.entries(dataset)) {
		el.dataset[key] = value;
	}
	document.body.appendChild(el);
	return el;
}

function errorCard(el: HTMLElement): Element | null {
	return el.querySelector("editable-region-error-card");
}

/** A mock file that records `getInputConfig` slugs and answers with `config`. */
function mockFile(config: unknown): MockFile & {
	getInputConfigCalls: string[];
} {
	const getInputConfigCalls: string[] = [];
	return {
		path: "/src/pages/index.astro",
		data: { get: () => Promise.resolve({}) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
		getInputConfig: async ({ slug }: { slug?: string }) => {
			getInputConfigCalls.push(slug ?? "");
			return config;
		},
		getInputConfigCalls,
		__kind: "file",
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	} as MockFile & { getInputConfigCalls: string[] };
}

let createdRegions: any[];

beforeEach(() => {
	document.body.replaceChildren();
	resetMock();
	createdRegions = [];
	(CloudCannon as any).createTextEditableRegion = async (
		_element: HTMLElement,
		_onChange: unknown,
		options: any,
	) => {
		createdRegions.push(options);
		return { setContent: () => undefined, destroy: () => undefined };
	};
});

// --- validateConfiguration: required attributes ---------------------------

test("requires a data-path attribute", () => {
	const el = sourceElement({ key: "intro" });
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(false);
	expect(errorCard(el)?.getAttribute("heading")).toBe(
		"Failed to render source editable region",
	);
	expect(errorCard(el)?.getAttribute("message")).toContain("'data-path'");
});

test("requires a data-key attribute", () => {
	const el = sourceElement({ path: "/src/pages/index.astro" });
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(false);
	expect(errorCard(el)?.getAttribute("message")).toContain("'data-key'");
});

// --- validateConfiguration: data-input-config -----------------------------

test("accepts a region with no input config", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(true);
	expect(source.inputConfig).toBeUndefined();
	expect(errorCard(el)).toBeNull();
});

test("parses an inline data-input-config object", () => {
	const el = sourceElement({
		path: "/src/pages/index.astro",
		key: "intro",
		inputConfig: JSON.stringify({ label: "Intro", options: { bold: true } }),
	});
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(true);
	expect(source.inputConfig).toEqual({
		label: "Intro",
		options: { bold: true },
	});
	expect(errorCard(el)).toBeNull();
});

test.each([
	["null", "null"],
	["[]", "array"],
	["42", "number"],
	['"a string"', "string"],
	["true", "boolean"],
])("rejects a data-input-config that is %s", (json, expectedType) => {
	const el = sourceElement({
		path: "/src/pages/index.astro",
		key: "intro",
		inputConfig: json,
	});
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(false);
	expect(errorCard(el)?.getAttribute("message")).toContain(
		`type "${expectedType}"`,
	);
});

test("reports invalid JSON and surfaces the parse error as a hint", () => {
	const el = sourceElement({
		path: "/src/pages/index.astro",
		key: "intro",
		inputConfig: "{ not json",
	});
	const source = new EditableSource(el);

	expect(source.validateConfiguration()).toBe(false);
	const card = errorCard(el);
	expect(card?.getAttribute("message")).toContain("as JSON");
	expect(card?.getAttribute("hint")).toBeTruthy();
});

// --- validateValue --------------------------------------------------------

test("validateValue accepts null", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	expect(source.validateValue(null)).toBeNull();
	expect(errorCard(el)).toBeNull();
});

test("validateValue rejects a non-string value", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	expect(source.validateValue(42)).toBeUndefined();
	expect(errorCard(el)?.getAttribute("message")).toContain("does not exist");
});

test("validateValue rejects a source that lacks the data-key", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	expect(source.validateValue('<p data-key="other">x</p>')).toBeUndefined();
	expect(errorCard(el)?.getAttribute("message")).toContain(
		"Failed to find an element",
	);
});

test("validateValue rejects duplicate data-key values", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	const value = '<p data-key="intro">a</p><p data-key="intro">b</p>';
	expect(source.validateValue(value)).toBeUndefined();
	expect(errorCard(el)?.getAttribute("message")).toContain("unique");
});

test("validateValue returns a valid source string", () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	const value = '<p data-key="intro">hello</p>';
	expect(source.validateValue(value)).toBe(value);
	expect(errorCard(el)).toBeNull();
});

// --- mountEditor: input config resolution ---------------------------------

test("mountEditor resolves the input config from data-input", async () => {
	const el = sourceElement({
		path: "/src/pages/index.astro",
		key: "intro",
		input: "my-slug",
	});
	const source = new EditableSource(el);
	const file = mockFile({ label: "Resolved" });
	source.file = file as any;

	await source.mountEditor();

	expect(file.getInputConfigCalls).toEqual(["my-slug"]);
	expect(createdRegions[0].inputConfig).toEqual({
		label: "Resolved",
		type: "html",
	});
});

test("inline data-input-config takes precedence over data-input", async () => {
	const el = sourceElement({
		path: "/src/pages/index.astro",
		key: "intro",
		input: "my-slug",
		inputConfig: JSON.stringify({ label: "Inline" }),
	});
	const source = new EditableSource(el);
	expect(source.validateConfiguration()).toBe(true);

	const file = mockFile({ label: "Resolved" });
	source.file = file as any;

	await source.mountEditor();

	expect(file.getInputConfigCalls).toEqual([]);
	expect(createdRegions[0].inputConfig).toEqual({
		label: "Inline",
		type: "html",
	});
});

test("mountEditor always sets the html input type", async () => {
	const el = sourceElement({ path: "/src/pages/index.astro", key: "intro" });
	const source = new EditableSource(el);

	await source.mountEditor();

	expect(createdRegions[0].inputConfig).toEqual({ type: "html" });
});
