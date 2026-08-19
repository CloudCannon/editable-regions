/**
 * Bundle-path tests for the globals a component can reach when the renderer
 * renders it: the `site` global object (a real Hugo `Site`), the `hugo.*`
 * namespace, and query helpers over site data.
 *
 * These run the full consumer chain, exactly as register/render/slots do:
 * the fixture site (test/unit/_fixtures/hugo) is built by real Hugo, its
 * snapshot is emitted into the live-editing bundle, and the browser runtime
 * writes that snapshot into the WASM renderer. The `globals-*.html` probe
 * partials live in the fixture and are rendered through `cc_components` with
 * `{}` props — the same calls a user component partial makes.
 *
 * The probe config lives in the fixture too: title, `languageCode` (emitted
 * as `locale`), extra params, two menus, and the `data/` files.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
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

// The fixture's data/ files, mirrored at boot as datasets (data files are no
// longer part of the template snapshot — datasets are the data source).
const navFile = mkFile("/data/nav.yaml", {
	links: [
		{ label: "Home", url: "/" },
		{ label: "Blog", url: "/blog/" },
	],
});
const socialFile = mkFile("/data/social.json", {
	twitter: "https://twitter.com/cloudcannon",
});

setMockFiles([navFile, socialFile]);
setMockDatasetsList([
	makeMockDataset("nav", navFile),
	makeMockDataset("social", socialFile),
]);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

// --- site.* -----------------------------------------------------------------

test("components can read site.Title", async () => {
	const el = await window.cc_components?.["globals-title"]({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(lines(el)).toBe("Hugo Unit Fixture");
});

test("site.Params exposes params by dotted path, nested map, array, and site.Param", async () => {
	const el = await window.cc_components?.["globals-params"]({});

	expect(lines(el)).toBe("Fixture Brand\napac\none,two\nFixture Brand");
});

test("site.Menus holds named menus with name, url, and weight", async () => {
	const el = await window.cc_components?.["globals-menus"]({});

	expect(lines(el)).toBe("Home=/@1;Blog=/blog/@2;\n1");
});

test("site.Language exposes lang and locale through the emitted snapshot", async () => {
	const el = await window.cc_components?.["globals-language"]({});

	// `en-AU` flows: fixture languageCode -> snapshot `locale` -> WASM config
	// locale -> site.Language.Locale. `lang` stays at the Hugo default "en".
	expect(lines(el)).toBe("lang=en\nlocale=en-AU\ncode=en-AU");
});

test("site.BaseURL and relURL resolve relative URLs", async () => {
	const el = await window.cc_components?.["globals-baseurl"]({});

	expect(lines(el)).toBe("/\n/styles.css");
});

// --- data --------------------------------------------------------------------

test("the dataset files (a yaml + a json) are accessible as site data", async () => {
	const el = await window.cc_components?.["globals-data"]({});

	expect(lines(el)).toBe(
		"Home;Blog;\nhttps://twitter.com/cloudcannon\nsiteDataLen=2",
	);
});

test("site data can be queried with where, index, and default", async () => {
	const el = await window.cc_components?.["globals-query"]({});

	expect(lines(el)).toBe("Home\nHome\nfallback");
});

// --- pages -------------------------------------------------------------------

test("page collections are safe and empty-ish in the editor site", async () => {
	const el = await window.cc_components?.["globals-collections"]({});

	expect(lines(el)).toBe(
		"regularPages=0\npages=1\nsections=0\nhomeTitle=\nhomeRegularPages=0",
	);
});

test("site.GetPage resolves the home page and misses elsewhere", async () => {
	const el = await window.cc_components?.["globals-getpage"]({});

	expect(lines(el)).toBe("home=\nmissing");
});

// --- hugo.* namespace --------------------------------------------------------

test("hugo.* reports the version and the editor runtime flags", async () => {
	const el = await window.cc_components?.["globals-hugo"]({});

	const parts = lines(el).split("\n");
	expect(parts).toEqual([
		expect.stringMatching(/^version=0\.\d+\.\d+/),
		"server=true",
		"env=production",
		"production=true",
		"development=false",
		"extended=false",
		"multilingual=false",
		"wd=",
	]);
});

test("hugo.Sites lists the editor site", async () => {
	const el = await window.cc_components?.["globals-sites"]({});

	expect(lines(el)).toBe("1\nHugo Unit Fixture");
});

// --- composition --------------------------------------------------------------

test("site stays in scope inside a nested partial the component calls", async () => {
	const el = await window.cc_components?.["globals-parent"]({});

	expect(lines(el)).toBe("Hugo Unit Fixture");
});
