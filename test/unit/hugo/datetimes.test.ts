import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import { renderer } from "../_helpers/wasm-renderer";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	makeMockDataset,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockDatasetsList,
	setMockFiles,
} from "../_mocks/cloudcannon";

function mkFile(path: string, data: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

const home = mkFile("/content/_index.md", {
	title: "Home",
	date: "2024-01-01",
});
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15T10:30:00+10:00[+10:00]",
});
const two = mkFile("/content/blog/two.md", {
	title: "Two",
	author: "bob",
	date: "2025-02-20T10:30:00+00:00[UTC]",
});
const nav = mkFile("/data/nav.yaml", { links: [{ label: "Home", url: "/" }] });
const social = mkFile("/data/social.json", {
	twitter: "twitter.com/c",
	updated: "2025-03-05T10:30:00.123-05:00[-05:00]",
});

const contentFiles = [home, one, two];
setMockFiles([...contentFiles, nav, social]);
setMockCollectionsList([makeMockCollection("content", contentFiles)]);
setMockDatasetsList([
	makeMockDataset("nav", nav),
	makeMockDataset("social", social),
]);
setMockCurrentFile(one);

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test("annotated datetimes are stripped in mirrored front matter and data", async () => {
	const el = await window.cc_components?.["content-pages"]({});

	expect(el?.textContent).toContain("One|blog|alice|2025-01-15");
	expect(el?.textContent).toContain("Two|blog|bob|2025-02-20");

	const files = renderer().readHugoFiles(
		JSON.stringify([
			"content/blog/one.md",
			"content/blog/two.md",
			"data/social.json",
		]),
	);
	expect(files["content/blog/one.md"]).toContain(
		'"date":"2025-01-15T10:30:00+10:00"',
	);
	expect(files["content/blog/two.md"]).toContain(
		'"date":"2025-02-20T10:30:00+00:00"',
	);
	expect(JSON.parse(files["data/social.json"])).toEqual({
		twitter: "twitter.com/c",
		updated: "2025-03-05T10:30:00.123-05:00",
	});
});

test("a failed build is reported once and the next render succeeds", async () => {
	// Written straight into the engine, bypassing the mirror's stripping.
	renderer().writeHugoFiles(
		JSON.stringify({
			"content/blog/bad.md": "---\ntitle: Bad\ndate: not-a-date\n---\n",
		}),
	);

	await expect(window.cc_components?.static({})).rejects.toThrow(
		/parsable date/,
	);

	const el = await window.cc_components?.static({});
	expect(el?.textContent).toContain("hello from hugo");
});
