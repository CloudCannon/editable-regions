/**
 * Content loading and collections: the editor site's content tree comes from
 * the CloudCannon API at runtime (front matter only, blank bodies) and is
 * queried with the full Hugo collection surface. The page being edited is
 * captured once at boot (navigating reboots the editor), and its stub is
 * opted into publishing so it renders through the cascade.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockFiles,
} from "../_mocks/cloudcannon";

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
	// Explicit date so home doesn't inherit Hugo's default "latest content date".
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

const bootFiles = [home, blogIndex, one, two, about];
setMockFiles(bootFiles);
// One collection mirrors every boot content file as a stub (verbatim source
// paths under the editor's default content dir); the runtime doesn't read
// CloudCannon.files().
setMockCollectionsList([makeMockCollection("content", bootFiles)]);
// The page being edited for this whole boot, captured by the runtime once
// before the engine starts (home-page fallback: home-page.test.ts).
setMockCurrentFile(one);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

// --- Current page context ------------------------------------------------

test("a component sees the boot-time current page's title, params, and identity as `page`", async () => {
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

test("the full collections surface queries the loaded tree", async () => {
	const el = await window.cc_components?.["collections-query"]({});

	expect(lines(el)).toBe(
		[
			"1", // site.Pages of kind home
			"1", // ...kind section (blog — the headless dispatch page stays out)
			"3", // ...kind page (one, two, about)
			"1|Blog;", // site.Sections
			"2", // where site.RegularPages "Section" "blog"
			"1", // where site.RegularPages "Params.author" "alice"
			"Blog|Posts from the fixture.|2", // site.GetPage "/blog/" → section with params
			"2|1", // site.Home.Pages | site.Home.RegularPages — under the render-link
			// cascade, home's list surfaces only its direct children (the blog
			// section + about); descendants under the link section stay out.
			"The first post.|0", // .Summary honors front matter summary; blank body stays blank
			"About;One;Two;", // site.RegularPages.ByTitle
		].join("\n"),
	);
});

// --- Steady state --------------------------------------------------------

test("re-renders stay fresh through repeated renders of the same page", async () => {
	const first = await window.cc_components?.["page-context"]({
		title: "First",
	});
	expect(lines(first)).toContain("First");

	const second = await window.cc_components?.["page-context"]({
		title: "Second",
	});
	expect(lines(second)).toContain("Second");
	expect(lines(second)).not.toContain("First");
});

test("the session target is fixed at boot: later current-file changes don't switch pages", async () => {
	// Navigating reboots the editor (fresh page load), so the runtime never
	// re-reads the current page after boot.
	setMockCurrentFile(two);
	const el = await window.cc_components?.["page-context"]({
		title: "Still One",
	});

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
			"Still One",
		].join("\n"),
	);
});
