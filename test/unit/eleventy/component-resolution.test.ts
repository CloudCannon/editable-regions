import { beforeAll, expect, test } from "vitest";

import { componentsReady } from "../_helpers/live-editing";

// Built bundle — run `npm run test:build-eleventy-plugin-config` first.
// config-component-dirs.mjs sets componentDirs: ["src/_includes", "src/partials"],
// so LiquidJS root is ["src/_includes", "src/partials"]. The proxy generates
// {% include "name" %} which LiquidJS resolves by trying each root in order.
import "../_fixtures/eleventy-plugin-config/_site/component-dirs/register-components.js";

beforeAll(componentsReady);

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

// --- Include extension resolution ---
// The configured extension is appended only when the path has none, matching
// LiquidJS's Node filesystem.

test("an .html include resolves rather than having .liquid appended", async () => {
	const el = await window.cc_components?.["html-file.html"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("An .html include file.");
});

test("an explicit .liquid include resolves", async () => {
	const el = await window.cc_components?.["liquid-file.liquid"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("A .liquid include file.");
});

test("a .liquid component can include an .html partial", async () => {
	const el = await window.cc_components?.["includes-html-partial"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector(".includes-html-partial p")?.textContent).toBe(
		"An .html include file.",
	);
});

test("a .liquid component can include a .liquid partial by full name", async () => {
	const el = await window.cc_components?.["includes-liquid-partial"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector(".includes-liquid-partial p")?.textContent).toBe(
		"A .liquid include file.",
	);
});

test("an extensionless include of an .html file does not resolve", async () => {
	// `html-file` gets `.liquid` appended, so only html-file.liquid would match.
	// Non-`.liquid` partials must be included with their extension.
	await expect(window.cc_components?.["html-file"]({})).rejects.toThrow();
});

test("a dot in a directory name is not mistaken for an extension", async () => {
	// `v1.2/dotted-dir-partial` has no extension, so `.liquid` is still appended.
	const el = await window.cc_components?.["includes-dotted-dir"]({});
	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector(".includes-dotted-dir p")?.textContent).toBe(
		"A .liquid partial in a directory with a dot in its name.",
	);
});

test("a component outside the custom dirs does not resolve", async () => {
	// index.liquid is in src/ (not in componentDirs), so it's absent from
	// the in-memory filesystem. The proxy generates {% include "index" %}
	// which throws ENOENT.
	await expect(window.cc_components?.index({})).rejects.toThrow();
});
