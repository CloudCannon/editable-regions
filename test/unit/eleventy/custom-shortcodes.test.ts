import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("an auto-mirrored shortcode (addShortcode) renders correctly", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({});

	const year = el?.querySelector("[data-year]")?.textContent;
	expect(year).toMatch(/^\d{4}$/);
});

test("an auto-mirrored shortcode that closes over module scope renders correctly", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({});

	// buildTime closes over `buildInfo` — the closure survives bundling.
	expect(el?.querySelector("[data-build-time]")?.textContent).toMatch(
		/^fixture@/,
	);
});

test("an auto-mirrored async shortcode (addAsyncShortcode) renders correctly", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({});

	expect(el?.querySelector("[data-async-greeting]")?.textContent).toBe(
		"hi from an async shortcode",
	);
});

test("a shortcode override (diskSize) replaces the non-portable server shortcode", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({});

	// Server-side, diskSize calls fs.statSync. Browser override returns "—".
	expect(el?.querySelector("[data-disk-size]")?.textContent).toBe("—");
});

test("an auto-mirrored paired shortcode (addPairedShortcode) renders with content", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({
		highlightColor: "lime",
		highlightContent: "note",
	});

	const highlight = el?.querySelector("[data-highlight] mark");
	expect(highlight).toBeTruthy();
	expect(highlight?.getAttribute("style")).toBe("background:lime");
	expect(highlight?.textContent).toBe("note");
});

test("an auto-mirrored paired shortcode that closes over module scope renders correctly", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({
		boxContent: "inside the box",
	});

	const box = el?.querySelector("[data-box] .box");
	expect(box).toBeTruthy();
	expect(box?.getAttribute("data-stamp")).toMatch(/^fixture@/);
	expect(box?.textContent).toBe("inside the box");
});

test("an auto-mirrored async paired shortcode (addPairedAsyncShortcode) renders correctly", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({
		wrapContent: "wrapped content",
	});

	const wrap = el?.querySelector("[data-async-wrap] aside.async-wrap");
	expect(wrap).toBeTruthy();
	expect(wrap?.textContent).toBe("wrapped content");
});

test("a paired shortcode override (diskWrap) replaces the non-portable server shortcode", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({
		wrapContent: "content",
	});

	const wrap = el?.querySelector("[data-disk-wrap] div");
	expect(wrap).toBeTruthy();
	expect(wrap?.getAttribute("data-size")).toBe("—");
});

test("layer precedence: Liquid-specific shortcode wins over universal on name collision", async () => {
	const el = await window.cc_components?.["shortcodes-demo"]({});

	// `sizer` is registered via both addShortcode (universal) and
	// addLiquidShortcode (liquid). The Liquid layer wins.
	expect(el?.querySelector("[data-sizer]")?.textContent).toBe("liquid-sizer");
});
