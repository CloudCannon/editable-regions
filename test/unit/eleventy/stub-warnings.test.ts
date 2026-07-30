/**
 * Every Eleventy config calls `addPlugin(editableRegions)`, and this plugin's own
 * module is always stubbed in the browser bundle — so the replay-time stub warning
 * fired on every site, for a skip that is expected and not actionable. Other
 * specifiers still warn, because there the advice is worth acting on.
 *
 * `setStubsStrict` is one-way, so the strict case goes last.
 */

import { afterEach, expect, test, vi } from "vitest";

import {
	onStubInvoked,
	setStubsStrict,
} from "../../../integrations/eleventy/browser/stub-mode.mjs";

afterEach(() => {
	vi.restoreAllMocks();
});

test("the plugin's own module is skipped without warning", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	onStubInvoked("@cloudcannon/editable-regions/eleventy", "called");

	expect(warn).not.toHaveBeenCalled();
});

test("any other stubbed module still warns", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	onStubInvoked("sharp", "called");

	expect(warn).toHaveBeenCalledTimes(1);
	expect(warn.mock.calls[0][0]).toContain('"sharp" was called');
});

test("a stubbed module only warns once", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	onStubInvoked("node:fs", "called");
	onStubInvoked("node:fs", "constructed");

	expect(warn).toHaveBeenCalledTimes(1);
});

test("once strict, even the plugin's own module throws", () => {
	setStubsStrict();

	expect(() =>
		onStubInvoked("@cloudcannon/editable-regions/eleventy", "called"),
	).toThrow(/no browser equivalent/);
	expect(() => onStubInvoked("sharp", "called")).toThrow(
		/no browser equivalent/,
	);
});
