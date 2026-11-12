/** Content arrives as empty-bodied front matter; the edited page is captured once at boot. */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	makeMockCollection,
	setMockCollectionsList,
	setMockCurrentFile,
	setMockFiles,
} from "../_mocks/cloudcannon.js";

function mkFile(path: string, frontMatter: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(frontMatter) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

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
// One collection mirrors every boot file as a stub; the runtime ignores CloudCannon.files().
setMockCollectionsList([makeMockCollection("content", bootFiles)]);
setMockCurrentFile(one);

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("a component sees the boot-time current page's title, params, and identity as `page`", async () => {
	const el = await window.cc_components?.["page-context"]({
		title: "Prop One",
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
			"Prop One",
		].join("\n"),
	);
});

test("the editor site's page tree reflects the loaded front matter", async () => {
	const el = await window.cc_components?.["content-pages"]({});

	expect(lines(el)).toBe(
		[
			"3",
			"One|blog|alice|2025-01-15",
			"Two|blog|bob|2025-02-20",
			"About||carol|2025-03-05",
			"One|alice",
			"Card From Front Matter",
		].join("\n"),
	);
});

test("the full collections surface queries the loaded tree", async () => {
	const el = await window.cc_components?.["collections-query"]({});

	expect(lines(el)).toBe(
		[
			"1",
			"1",
			"3",
			"1|Blog;",
			"2",
			"1",
			"Blog|Posts from the fixture.|2",
			"2|1",
			"The first post.|0",
			"About;One;Two;",
		].join("\n"),
	);
});

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
