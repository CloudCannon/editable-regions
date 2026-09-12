/**
 * Mid-session freshness: `change`/`delete` events on mirrored collections and
 * datasets rewrite the affected stub or data file; the renderer folds the
 * pending write into its next render batch.
 */

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	makeMockDataset,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockDatasetsList,
	setMockFiles,
} from "../_mocks/cloudcannon";

/** Builds a mock API file from its front matter / data; only data.get() is used. */
function mkFile(path: string, data: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

/** The fixture's front matter, exactly as its content files define it. */
const home = mkFile("/content/_index.md", {
	title: "Home",
	date: "2024-01-01",
	theme: "dark",
	card: {
		title: "Card From Front Matter",
		body: "Some **bold** body text",
		tags: ["alpha", "beta"],
	},
});
const blogIndex = mkFile("/content/blog/_index.md", {
	title: "Blog",
	subtitle: "Posts from the fixture.",
});
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15",
	summary: "The first post.",
	tags: ["hugo", "editor"],
});
const two = mkFile("/content/blog/two.md", {
	title: "Two",
	author: "bob",
	date: "2025-02-20",
	summary: "The second post.",
	tags: ["hugo", "cloudcannon"],
});
const about = mkFile("/content/about.md", {
	title: "About",
	author: "carol",
	date: "2025-03-05",
	extra: { region: "oceania", active: true },
});
const three = mkFile("/content/blog/three.md", {
	title: "Three",
	author: "charlie",
	date: "2025-04-10",
	summary: "A brand-new post.",
});

// Datasets mirror the fixture's data files (data/nav.yaml + data/social.json)
// so site-data freshness is exercised against the same probe (globals-data).
const nav = mkFile("/data/nav.yaml", {
	links: [
		{ label: "Home", url: "/" },
		{ label: "Blog", url: "/blog/" },
	],
});
const social = mkFile("/data/social.json", {
	twitter: "https://twitter.com/example",
});

const bootFiles = [home, blogIndex, one, two, about];
const content = makeMockCollection("content", bootFiles);
const navDataset = makeMockDataset("nav", nav);
const socialDataset = makeMockDataset("social", social);
setMockFiles([...bootFiles, nav, social]);
setMockCollectionsList([content]);
setMockDatasetsList([navDataset, socialDataset]);
// The page being edited for this whole boot; the session target stays fixed
// at boot even as its data refreshes.
setMockCurrentFile(one);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

/** Renders a probe partial through the live bundle. */
async function render(key: string, props: Record<string, any> = {}) {
	return window.cc_components?.[key]?.(props);
}

// --- Change events: unrelated files are ignored ---------------------------

test("events outside the mirrored collections/datasets don't touch the editor site", async () => {
	// The content handler treats any event path as content; a template and a
	// data-ish path are both ignored.
	content.emit("change", "/layouts/partials/card.html");
	content.emit("change", "/data/links.yaml");

	// Boot-loaded content data is unchanged.
	const before = await render("content-pages");
	expect(lines(before)).toContain("Two|blog|bob|2025-02-20");
});

// --- Change events: current page ------------------------------------------

test("an edit to the current page's front matter refreshes `page` mid-session", async () => {
	const before = await render("page-context", { title: "Prop One" });
	expect(lines(before)).toContain("One");
	expect(lines(before)).toContain("alice");

	const renamed = mkFile("/content/blog/one.md", {
		title: "One Renamed",
		author: "alice",
		date: "2025-01-15",
		summary: "The first post.",
		tags: ["hugo", "editor"],
	});
	setMockFiles([home, blogIndex, renamed, two, about, nav, social]);
	content.emit("change", "/content/blog/one.md");

	// The stub kept its opt-in, so the re-render succeeds with the new front
	// matter through the `page` global.
	await vi.waitFor(async () => {
		const after = await render("page-context", { title: "Prop One" });
		expect(lines(after)).toContain("One Renamed");
	});
});

// --- Change events: other pages -------------------------------------------

test("an edit to another page's front matter refreshes collections", async () => {
	const twoRenamed = mkFile("/content/blog/two.md", {
		title: "Two Renamed",
		author: "bob",
		date: "2025-02-20",
		summary: "The second post.",
		tags: ["hugo", "cloudcannon"],
	});
	setMockFiles([home, blogIndex, one, twoRenamed, about, nav, social]);
	content.emit("change", "/content/blog/two.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Two Renamed|blog|bob|2025-02-20");
		expect(lines(el)).not.toContain("Two|blog");
	});
});

test("an edit to the home page's front matter refreshes site.Home.Params", async () => {
	const homeEdited = mkFile("/content/_index.md", {
		title: "Home",
		date: "2024-01-01",
		theme: "dark",
		card: {
			title: "Card Edited Live",
			body: "Some **bold** body text",
			tags: ["alpha", "beta"],
		},
	});
	setMockFiles([homeEdited, blogIndex, one, two, about, nav, social]);
	content.emit("change", "/content/_index.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Card Edited Live");
	});
});

// --- Dataset changes ------------------------------------------------------

test("a dataset change refreshes site data", async () => {
	const navEdited = mkFile("/data/nav.yaml", {
		links: [{ label: "About", url: "/about/" }],
	});
	setMockFiles([home, blogIndex, one, two, about, navEdited, social]);
	navDataset.emit("change", "/data/nav.yaml");

	await vi.waitFor(async () => {
		const el = await render("globals-data");
		expect(lines(el)).toContain("About;");
		expect(lines(el)).not.toContain("Home;");
	});
});

// --- Delete events --------------------------------------------------------

test("deleting a content file drops the page from collections", async () => {
	setMockFiles([home, blogIndex, one, about, nav, social]);
	content.emit("delete", "/content/blog/two.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("3"); // one, two, about → one, about
		expect(lines(el)).not.toContain("Two|");
	});
});

test("deleting the session's edit target keeps its stub", async () => {
	setMockFiles([home, blogIndex, two, about, nav, social]);
	content.emit("delete", "/content/blog/one.md");

	// The page being edited still renders: its opt-in and stub are kept so the
	// render chain doesn't break mid-session.
	const el = await render("page-context", { title: "Still Editable" });
	expect(lines(el)).toContain("One");
	expect(lines(el)).toContain("Still Editable");
});

test("deleting a dataset file drops it from site data", async () => {
	setMockFiles([home, blogIndex, one, two, about, nav]);
	socialDataset.emit("delete", "/data/social.json");

	await vi.waitFor(async () => {
		const el = await render("globals-data");
		// social.json is gone (twitter renders empty) while nav keeps rendering.
		expect(lines(el)).not.toContain("https://twitter.com/example");
		expect(lines(el)).toContain("siteDataLen=");
	});
});

// --- New files ------------------------------------------------------------

test("a newly created content file appears in collections", async () => {
	// Simulates file creation: the stub wasn't loaded at boot, but the
	// change-event write lands it in the renderer's file store.
	setMockFiles([home, blogIndex, one, two, about, three, nav, social]);
	content.emit("change", "/content/blog/three.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Three|blog|charlie|2025-04-10");
	});
});
