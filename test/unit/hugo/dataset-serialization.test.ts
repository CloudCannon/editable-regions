/**
 * Bundle-path tests for dataset serialization on the mirror: every dataset is
 * written as JSON, and non-YAML/JSON source extensions (`.toml`, `.csv`, …)
 * are rewritten to `.json` so Hugo decodes them natively; the delete path
 * targets the same rewritten file.
 */

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import { renderer } from "../_helpers/wasm-renderer";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockDataset,
	setMockDatasetsList,
	setMockFiles,
} from "../_mocks/cloudcannon";

/** Builds a mock API file whose data.get() resolves the dataset's data. */
function mkFile(path: string, data: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

const nav = mkFile("/data/nav.yaml", { links: [{ label: "Home", url: "/" }] });
const social = mkFile("/data/social.json", { twitter: "twitter.com/c" });
const settings = mkFile("/data/settings.toml", { theme: "dark", count: 3 });

const settingsDataset = makeMockDataset("settings", settings);

setMockFiles([nav, social, settings]);
setMockDatasetsList([
	makeMockDataset("nav", nav),
	makeMockDataset("social", social),
	settingsDataset,
]);

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test(".yaml/.json datasets keep their extension; others are rewritten to .json", async () => {
	// Trigger a render so the engine and its boot-time dataset mirror finish
	// before the mirrored files are inspected.
	await window.cc_components?.["globals-data"]?.({});

	const files = renderer().readHugoFiles(
		JSON.stringify([
			"data/nav.yaml",
			"data/social.json",
			"data/settings.json",
			"data/settings.toml",
		]),
	);

	// Kept extensions are written at their source path and are valid JSON.
	expect(files["data/nav.yaml"]).toBeDefined();
	expect(files["data/social.json"]).toBeDefined();
	expect(JSON.parse(files["data/nav.yaml"])).toEqual({
		links: [{ label: "Home", url: "/" }],
	});

	expect(files["data/settings.toml"]).toBeUndefined();
	expect(JSON.parse(files["data/settings.json"])).toEqual({
		theme: "dark",
		count: 3,
	});
});

test("deleting a foreign-extension dataset removes its .json mirror", async () => {
	settingsDataset.emit("delete", "/data/settings.toml");

	await vi.waitFor(() => {
		const files = renderer().readHugoFiles(
			JSON.stringify(["data/settings.json"]),
		);
		expect(files["data/settings.json"]).toBeUndefined();
	});
});
