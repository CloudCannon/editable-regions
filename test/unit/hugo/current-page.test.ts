/**
 * Bundle-path tests for content loading: the editor site's content tree
 * comes from the CloudCannon API at runtime (decision 10) — front matter
 * only, blank bodies — and the renderer renders the *current* page through
 * the dispatch layout, so component partials reach that page via the `page`
 * global.
 *
 * These use the existing CloudCannon API mock: `setMockFiles` supplies the
 * content listing the runtime loads at boot, and `setMockCurrentFile` is the
 * "current page" the editor is editing. Mock state is set at module scope so
 * it's in place before `beforeAll(loadHugoBundle)` boots the engine.
 *
 * The fixture's real content files (test/unit/_fixtures/hugo/content/) mirror
 * this listing; the bundle itself never snapshots content files.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import { setMockCurrentFile, setMockFiles } from "../_mocks/cloudcannon";

/** Builds a mock API file from its front matter; only data.get() is used. */
function mkFile(path: string, frontMatter: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(frontMatter) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

/** The fixture's front matter, exactly as its content files define it. */
const home = mkFile("/content/_index.md", {
	title: "Home",
	// An explicit date so the home page doesn't inherit Hugo's default
	// "latest content date" when the editor site is assembled.
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

setMockFiles([home, blogIndex, one, two, about]);
setMockCurrentFile(one);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

// --- Current page context ------------------------------------------------

test("a component sees the current page's title, params, and identity as `page`", async () => {
	const el = await window.cc_components?.["page-context"]({
		title: "Prop One",
	});

	expect(lines(el)).toBe(
		[
			"One", // page.Title from the loaded front matter
			"alice", // page.Params.author
			"blog", // page.Section
			"/blog/one/", // page.RelPermalink
			"page", // page.Kind
			"2025-01-15", // page.Date from front matter
			"length=0", // bodies stay blank in the editor
			"", // page.Params.theme (not set on this page)
			"Prop One", // props still arrive as the component's context
		].join("\n"),
	);
});

test("the editor site's page tree reflects the loaded front matter", async () => {
	const el = await window.cc_components?.["content-pages"]({});

	expect(lines(el)).toBe(
		[
			"3", // one, two, about (regular pages)
			"One|blog|alice|2025-01-15", // ByDate ascending
			"Two|blog|bob|2025-02-20",
			"About||carol|2025-03-05",
			"One|alice", // site.GetPage over a loaded stub
			"Card From Front Matter", // site.Home.Params from the real home stub
		].join("\n"),
	);
});

// --- Switching the current page ------------------------------------------

test("changes the current page with setMockCurrentFile between renders", async () => {
	setMockCurrentFile(two);
	const el = await window.cc_components?.["page-context"]({
		title: "Prop Two",
	});

	expect(lines(el)).toBe(
		[
			"Two",
			"bob",
			"blog",
			"/blog/two/",
			"page",
			"2025-02-20",
			"length=0",
			"",
			"Prop Two",
		].join("\n"),
	);
});

test("switching back to the first page keeps its data intact", async () => {
	setMockCurrentFile(one);
	const el = await window.cc_components?.["page-context"]({ title: "Back" });

	expect(lines(el)).toBe(
		[
			"One",
			"alice",
			"blog",
			"/blog/one/",
			"page",
			"2025-01-15",
			"length=0",
			"",
			"Back",
		].join("\n"),
	);
});

test("with no current file, the component renders against the home page", async () => {
	setMockCurrentFile(null);
	const el = await window.cc_components?.["page-context"]({});

	// No props are passed, so the final prop-title line renders empty and is
	// trimmed by `lines`.
	expect(lines(el)).toBe(
		[
			"Home", // the loaded home front matter
			"", // no author on home
			"", // home has no section
			"/",
			"home",
			"2024-01-01", // the home stub's explicit date
			"length=0",
			"dark", // page.Params.theme survives on the home stub
		].join("\n"),
	);
});
