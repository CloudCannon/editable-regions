import { beforeAll, expect, test } from "vitest";

import { componentsReady } from "../_helpers/live-editing.js";

// Built bundle — run `npm run test:build-eleventy-fixture` first.
import "../_fixtures/eleventy/_site/register-components.js";

beforeAll(componentsReady);

test("the built bundle registers components on window.cc_components", () => {
	expect(window.cc_components).toBeTruthy();
	const keys = Object.keys(window.cc_components ?? {});
	// Proxy resolves unknown names on demand, so only pinned components are own keys.
	expect(keys).toContain("card");
});

test("each registered renderer is a function", () => {
	const keys = Object.keys(window.cc_components ?? {});
	for (const key of keys) {
		expect(typeof window.cc_components?.[key]).toBe("function");
	}
});

test("the component proxy resolves unknown names on demand via {% include %}", async () => {
	const el = await window.cc_components?.static({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
	expect(el?.querySelector("p")?.textContent).toBe("hello from liquid");
});

test("a pinned component takes precedence over the proxy", async () => {
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
	const expected = [
		"src/_includes/static.liquid",
		"src/_includes/card.liquid",
		"src/_includes/counter.liquid",
	];
	for (const path of expected) {
		expect(files).toContain(path);
	}
});

// 11ty sets LiquidJS root to [includes, input]; the first existsSync match wins.

test("the includes directory is preferred over the input directory", async () => {
	const el = await window.cc_components?.["resolution-order"]({});
	expect(el?.querySelector(".resolution-order")?.textContent).toBe(
		"from-includes",
	);
});

test("nested paths resolve within the includes directory", async () => {
	const el = await window.cc_components?.["nested/nested-component"]({});
	expect(el?.querySelector(".nested-component")?.textContent).toBe(
		"from-nested-includes",
	);
});

test("an explicit .liquid extension resolves to the same component", async () => {
	const el = await window.cc_components?.["static.liquid"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("hello from liquid");
});

test("the input directory is searched when the includes directory has no match", async () => {
	const el = await window.cc_components?.index({});
	expect(el).toBeInstanceOf(HTMLElement);
});
