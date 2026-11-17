/** Non-YAML/JSON datasets are mirrored as .json so Hugo decodes them natively. */

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";
import { renderer } from "../_helpers/wasm-renderer.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	makeMockDataset,
	setMockDatasetsList,
	setMockFiles,
} from "../_mocks/cloudcannon.js";

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
	// Render first so the boot-time dataset mirror finishes before inspecting files.
	await window.cc_components?.["globals-data"]?.({});

	const files = renderer().readHugoFiles(
		JSON.stringify([
			"data/nav.yaml",
			"data/social.json",
			"data/settings.json",
			"data/settings.toml",
		]),
	);

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
