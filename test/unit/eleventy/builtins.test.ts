import { beforeEach, expect, test, vi } from "vitest";

import {
	dateToRfc822,
	dateToRfc3339,
	eleventyFilters,
	getNewestCollectionItemDate,
	htmlDateString,
	inputPathToUrlFilter,
	logFilter,
	slugFilter,
	slugifyFilter,
	urlFilter,
} from "../../../integrations/eleventy/browser/liquid-builtins.mjs";
import { registerPageMap } from "../../../integrations/liquid/page-map.mjs";
import { type MockFile, resetMock, setMockFiles } from "../_mocks/cloudcannon";

import "../_fixtures/eleventy/_site/register-components.js";

beforeEach(() => {
	resetMock();
	registerPageMap({});
});

// --- slug / slugify ---

test("slug filter (simov/slugify) is permissive — keeps +, @, ., substitutes &", () => {
	expect(slugFilter("C++ programming for users@example.com")).toBe(
		"c++-programming-for-users@example.com",
	);
	expect(slugFilter("R&D department")).toBe("randd-department");
});

test("slugify filter (sindresorhus) is strict ASCII", () => {
	expect(slugifyFilter("Hello, World! Café résumé")).toBe(
		"hello-world-cafe-resume",
	);
});

// --- log ---

test("log filter returns the value unchanged", () => {
	const spy = vi.spyOn(console, "log").mockImplementation(() => {});
	expect(logFilter("test")).toBe("test");
	expect(spy).toHaveBeenCalledWith("test");
	spy.mockRestore();
});

test("log filter with a prefix includes it in the output", () => {
	const spy = vi.spyOn(console, "log").mockImplementation(() => {});
	expect(logFilter("test", "prefix")).toBe("test");
	expect(spy).toHaveBeenCalledWith("[prefix]", "test");
	spy.mockRestore();
});

// --- url ---

test("url filter passes through absolute URLs", () => {
	expect(urlFilter("https://example.com/path/")).toBe(
		"https://example.com/path/",
	);
});

test("url filter passes through protocol-relative URLs", () => {
	expect(urlFilter("//example.com/path/")).toBe("//example.com/path/");
});

test("url filter prepends pathPrefix to root-relative URLs", () => {
	expect(urlFilter("/posts/first/", "/blog")).toBe("/blog/posts/first/");
});

test("url filter passes through root-relative URLs when no pathPrefix", () => {
	expect(urlFilter("/posts/first/")).toBe("/posts/first/");
});

test("url filter returns empty string for falsy input", () => {
	expect(urlFilter("")).toBe("");
	expect(urlFilter(null as any)).toBe("");
});

// --- date filters ---

test("dateToRfc3339 formats a Date as ISO 8601", () => {
	expect(dateToRfc3339(new Date("2026-04-21T00:00:00Z"))).toBe(
		"2026-04-21T00:00:00.000Z",
	);
});

test("dateToRfc3339 accepts ISO strings and epoch numbers", () => {
	expect(dateToRfc3339("2026-04-21")).toMatch(/^2026-04-21/);
	expect(dateToRfc3339(1745193600000)).toMatch(/^2025/);
});

test("dateToRfc3339 returns empty string for invalid input", () => {
	expect(dateToRfc3339("not a date")).toBe("");
	expect(dateToRfc3339(null as any)).toBe("");
});

test("dateToRfc822 formats a Date as RFC 822", () => {
	expect(dateToRfc822(new Date("2026-04-21T00:00:00Z"))).toMatch(
		/^[A-Z][a-z]{2}, 21 Apr 2026 00:00:00 GMT$/,
	);
});

test("htmlDateString returns YYYY-MM-DD form", () => {
	expect(htmlDateString(new Date("2026-04-21T15:30:00Z"))).toBe("2026-04-21");
});

// --- getNewestCollectionItemDate ---

test("getNewestCollectionItemDate finds the newest date in a collection", () => {
	const collection = [
		{ date: new Date("2026-01-15") },
		{ date: new Date("2026-03-10") },
		{ date: new Date("2026-02-20") },
	];
	expect(getNewestCollectionItemDate(collection)).toEqual(
		new Date("2026-03-10"),
	);
});

test("getNewestCollectionItemDate falls back for an empty collection", () => {
	expect(getNewestCollectionItemDate([], new Date("2020-01-01"))).toEqual(
		new Date("2020-01-01"),
	);
	expect(getNewestCollectionItemDate([])).toEqual(new Date(0));
});

// --- inputPathToUrl ---

test("inputPathToUrl resolves a path from the page map", () => {
	registerPageMap({
		"src/index.liquid": { url: "/", outputPath: "_site/index.html" },
	});
	expect(inputPathToUrlFilter("src/index.liquid")).toBe("/");
});

test("inputPathToUrl passes through when the path is not in the page map", () => {
	const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
	expect(inputPathToUrlFilter("src/missing.liquid")).toBe("src/missing.liquid");
	spy.mockRestore();
});

test("inputPathToUrl returns empty string for non-string input", () => {
	expect(inputPathToUrlFilter(null as any)).toBe("");
	expect(inputPathToUrlFilter(123 as any)).toBe("");
});

// --- htmlBaseUrl / serverlessUrl (pass-through stubs) ---

test("htmlBaseUrl is a pass-through stub that returns the input unchanged", () => {
	const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
	expect(eleventyFilters.htmlBaseUrl("https://example.com")).toBe(
		"https://example.com",
	);
	spy.mockRestore();
});

test("serverlessUrl is a pass-through stub that returns the input unchanged", () => {
	const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
	expect(eleventyFilters.serverlessUrl("/some/path")).toBe("/some/path");
	spy.mockRestore();
});

// --- RenderPlugin shims (renderTemplate, renderContent, renderFile) ---

test("renderTemplate tag renders Liquid content with data", async () => {
	const el = await window.cc_components?.["render-plugin-demo"]({
		templateData: { who: "world" },
		renderContentBody: "{{ title }}",
	});

	expect(el?.querySelector("[data-render-template]")?.textContent).toBe(
		"hello world",
	);
});

test("renderContent filter renders Liquid content", async () => {
	const el = await window.cc_components?.["render-plugin-demo"]({
		templateData: { who: "world" },
		renderContentBody: "rendered <strong>{{ title }}</strong>",
	});

	// renderContent renders the body as Liquid against the render context.
	expect(el?.textContent).toContain("rendered");
});

test("renderFile shortcode fetches a file via the CC API and renders it", async () => {
	const mockFile: MockFile = {
		path: "src/_includes/render-target.liquid",
		data: { get: () => Promise.resolve({ title: "Override title" }) },
		get: () =>
			Promise.resolve(
				'<p data-render-target>Rendered body from {{ title | default: "render-target" }}.</p>',
			),
		content: {
			get: () =>
				Promise.resolve(
					'<p data-render-target>Rendered body from {{ title | default: "render-target" }}.</p>',
				),
		},
	};
	setMockFiles([mockFile]);

	const el = await window.cc_components?.["render-file-demo"]({
		renderTargetData: { title: "Override title" },
	});

	expect(el?.querySelector("[data-render-target]")?.textContent).toBe(
		"Rendered body from Override title.",
	);
});
