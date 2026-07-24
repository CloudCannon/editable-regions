import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-eleventy-plugin-config` first.
// config-component-dirs.mjs sets componentDirs: ["src/_includes", "src/partials"],
// so LiquidJS root is ["src/_includes", "src/partials"]. The proxy generates
// {% include "name" %} which LiquidJS resolves by trying each root in order.
import "../_fixtures/eleventy-plugin-config/_site/component-dirs/register-components.js";

// --- Component resolution with custom componentDirs ---

test("a component only in the first custom dir resolves", async () => {
	const el = await window.cc_components?.["liquid-file"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("A .liquid include file.");
});

test("a component only in the second custom dir resolves", async () => {
	const el = await window.cc_components?.["sub-partial"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe(
		"A .liquid partial in a subdirectory.",
	);
});

test("the first custom dir wins when a component exists in both dirs", async () => {
	// shared-component.liquid exists in both dirs — the first dir wins.
	const el = await window.cc_components?.["shared-component"]({});
	expect(el?.querySelector(".shared-component")?.textContent).toBe(
		"from-includes",
	);
});

test("a component outside the custom dirs does not resolve", async () => {
	// index.liquid is in src/ (not in componentDirs), so it's absent from
	// the in-memory filesystem. The proxy generates {% include "index" %}
	// which throws ENOENT.
	await expect(window.cc_components?.index({})).rejects.toThrow();
});
