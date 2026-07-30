import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-eleventy-fixture` first.
import "../_fixtures/eleventy/_site/register-components.js";

test("the built bundle registers components on window.cc_components", () => {
	expect(window.cc_components).toBeTruthy();
	const keys = Object.keys(window.cc_components ?? {});
	// The proxy resolves unknown names on demand, so only pinned components
	// appear as own keys.
	expect(keys).toContain("card");
});

test("each registered renderer is a function", () => {
	const keys = Object.keys(window.cc_components ?? {});
	for (const key of keys) {
		expect(typeof window.cc_components?.[key]).toBe("function");
	}
});

test("the component proxy resolves unknown names on demand via {% include %}", async () => {
	// `static` isn't pinned — the proxy resolves it via {% include "static.liquid" %}.
	const el = await window.cc_components?.static({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
	expect(el?.querySelector("p")?.textContent).toBe("hello from liquid");
});

test("a pinned component takes precedence over the proxy", async () => {
	// `card` is pinned to the override template (class `card--overridden`).
	const el = await window.cc_components?.card({
		title: "Test",
		body: "Body",
	});
	expect(el?.querySelector(".card--overridden")).toBeTruthy();
	expect(el?.querySelector(".card")?.getAttribute("data-source")).toBe(
		"card-override.mjs",
	);
});

test("window.cc_liquid_files is populated with bundled templates", () => {
	expect(window.cc_liquid_files).toBeTruthy();
	const files = Object.keys(window.cc_liquid_files ?? {});
	// Subset of known templates — not exhaustive.
	const expected = [
		"src/_includes/static.liquid",
		"src/_includes/card.liquid",
		"src/_includes/counter.liquid",
	];
	for (const path of expected) {
		expect(files).toContain(path);
	}
});

// --- Include resolution order ---
//
// 11ty configures LiquidJS with root: [includes, input]. LiquidJS tries
// each root in array order; the first existsSync match wins.

test("the includes directory is preferred over the input directory", async () => {
	// `resolution-order` exists in both `src/_includes/` and `src/`.
	const el = await window.cc_components?.["resolution-order"]({});
	expect(el?.querySelector(".resolution-order")?.textContent).toBe(
		"from-includes",
	);
});

test("nested paths resolve within the includes directory", async () => {
	// `nested/nested-component` exists in both `src/_includes/nested/` and `src/nested/`.
	const el = await window.cc_components?.["nested/nested-component"]({});
	expect(el?.querySelector(".nested-component")?.textContent).toBe(
		"from-nested-includes",
	);
});

test("an explicit .liquid extension resolves to the same component", async () => {
	// LiquidJS's fs.resolve detects the extension is already present.
	const el = await window.cc_components?.["static.liquid"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("hello from liquid");
});

test("the input directory is searched when the includes directory has no match", async () => {
	// `index` is only at `src/index.liquid` (not in _includes).
	const el = await window.cc_components?.index({});
	expect(el).toBeInstanceOf(HTMLElement);
});
