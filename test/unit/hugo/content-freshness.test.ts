/**
 * Bundle-path tests for mid-session content freshness: CloudCannon's
 * site-wide `change`/`delete` events push front-matter edits into the editor
 * site as they happen. The runtime subscribes after boot, filters to content
 * files (the configured content dir + content extensions), rewrites the
 * affected stub (preserving the home/session-page publishing opt-ins), and
 * runs a build-only rebuild — so the dispatch page stays alone in its own
 * render build (the single-content-write-per-build invariant).
 *
 * Each test mutates the mock file list (`setMockFiles`) and emits an event
 * via `emitMockApiChange`/`emitMockApiDelete`; the async handler resolves on
 * a later microtask, so assertions poll with `vi.waitFor`.
 */

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	emitMockApiChange,
	emitMockApiDelete,
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

setMockFiles([home, blogIndex, one, two, about]);
// The page being edited for this whole boot (freshness doesn't move it — the
// session target stays fixed at boot even as its data refreshes).
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

// --- Change events: non-content files are ignored ------------------------

test("change events for non-content files don't touch the editor site", async () => {
	emitMockApiChange("/layouts/partials/card.html");
	emitMockApiChange("/data/links.yaml");

	// Nothing broke, and boot-loaded content data is unchanged.
	const before = await render("content-pages");
	expect(lines(before)).toContain("Two|blog|bob|2025-02-20");
});

// --- Change events: current page -----------------------------------------

test("an edit to the current page's front matter refreshes `page` mid-session", async () => {
	const before = await render("page-context", { title: "Prop One" });
	expect(lines(before)).toContain("One");
	expect(lines(before)).toContain("alice");

	setMockFiles([
		home,
		blogIndex,
		mkFile("/content/blog/one.md", {
			title: "One Renamed",
			author: "alice",
			date: "2025-01-15",
			summary: "The first post.",
			tags: ["hugo", "editor"],
		}),
		two,
		about,
	]);
	emitMockApiChange("/content/blog/one.md");

	// The re-render succeeds (the stub kept its opt-in) and carries the new
	// front matter through the `page` global.
	await vi.waitFor(async () => {
		const after = await render("page-context", { title: "Prop One" });
		expect(lines(after)).toContain("One Renamed");
	});
});

// --- Change events: other pages ------------------------------------------

test("an edit to another page's front matter refreshes collections", async () => {
	setMockFiles([
		home,
		blogIndex,
		one,
		mkFile("/content/blog/two.md", {
			title: "Two Renamed",
			author: "bob",
			date: "2025-02-20",
			summary: "The second post.",
			tags: ["hugo", "cloudcannon"],
		}),
		about,
	]);
	emitMockApiChange("/content/blog/two.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Two Renamed|blog|bob|2025-02-20");
		expect(lines(el)).not.toContain("Two|blog");
	});
});

test("an edit to the home page's front matter refreshes site.Home.Params", async () => {
	setMockFiles([
		mkFile("/content/_index.md", {
			title: "Home",
			date: "2024-01-01",
			theme: "dark",
			card: {
				title: "Card Edited Live",
				body: "Some **bold** body text",
				tags: ["alpha", "beta"],
			},
		}),
		blogIndex,
		one,
		two,
		about,
	]);
	emitMockApiChange("/content/_index.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Card Edited Live");
	});
});

// --- Delete events -------------------------------------------------------

test("deleting a content file drops the page from collections", async () => {
	setMockFiles([home, blogIndex, one, about]);
	emitMockApiDelete("/content/blog/two.md");

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("3"); // one, two, about → one, about
		expect(lines(el)).not.toContain("Two|");
	});
});

test("deleting the session's edit target keeps its stub", async () => {
	setMockFiles([home, blogIndex, two, about]);
	emitMockApiDelete("/content/blog/one.md");

	// The page being edited still renders (its opt-in and stub are kept, so
	// the render chain doesn't break mid-session).
	await render("page-context", { title: "Still Editable" });
	const el = await render("page-context", { title: "Still Editable" });
	expect(lines(el)).toContain("One");
	expect(lines(el)).toContain("Still Editable");
});

// --- New files -----------------------------------------------------------

test("a newly created content file appears in collections", async () => {
	// Simulates file creation (isNew): the stub wasn't loaded at boot, yet the
	// write-then-rebuild path loads it into the store (verified in the WASM).
	setMockFiles([home, blogIndex, one, two, about, three]);
	emitMockApiChange("/content/blog/three.md", { isNew: true });

	await vi.waitFor(async () => {
		const el = await render("content-pages");
		expect(lines(el)).toContain("Three|blog|charlie|2025-04-10");
	});
});
