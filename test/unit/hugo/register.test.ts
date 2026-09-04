import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test("the built bundle installs the component proxy on window.cc_components", () => {
	expect(window.cc_components).toBeTruthy();
});

test("no components are pinned until the proxy resolves them on demand", () => {
	// Hugo's bundle is proxy-only: component keys resolve against the partial
	// snapshot at render time, so own keys stay empty until a renderer is pinned.
	expect(Object.keys(window.cc_components ?? {})).toHaveLength(0);
});

test("the proxy resolves component keys on demand against the partial snapshot", async () => {
	const el = await window.cc_components?.static({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.querySelector("p")?.textContent).toBe("hello from hugo");
});

test("component keys resolve with or without the .html extension", async () => {
	const bare = await window.cc_components?.props({ title: "Same" });
	const explicit = await window.cc_components?.["props.html"]({
		title: "Same",
	});

	expect(bare?.querySelector("h3")?.textContent).toBe("Same");
	expect(explicit?.querySelector("h3")?.textContent).toBe("Same");
	expect(bare?.outerHTML).toBe(explicit?.outerHTML);
});

test("nested component paths resolve", async () => {
	const bare = await window.cc_components?.["nested/deep"]({});
	const explicit = await window.cc_components?.["nested/deep.html"]({});

	expect(bare?.querySelector(".nested-deep")?.textContent).toBe(
		"deep from hugo",
	);
	expect(bare?.outerHTML).toBe(explicit?.outerHTML);
});

test("the emitted snapshot carries templates, config, and the wasm url", () => {
	const files = window.cc_hugo_files as Record<string, string> | undefined;
	expect(files?.["layouts/partials/static.html"]).toContain("hello from hugo");
	expect(files?.["layouts/partials/nested/deep.html"]).toBeDefined();

	// The site's config is snapshotted as its real file (config.toml), which
	// the renderer loads through Hugo's own config resolution.
	expect(files?.["config.toml"]).toContain("Fixture Brand");

	const meta = window.cc_hugo as Record<string, any> | undefined;
	expect(meta?.wasmUrl).toMatch(/hugo_renderer\.wasm\.[a-f0-9]+\.gz$/);
});

test("a renderer pinned on window.cc_components takes precedence over the proxy", async () => {
	const pinned = document.createElement("div");
	pinned.className = "pinned";
	pinned.textContent = "pinned renderer";

	(window.cc_components as Record<string, unknown>).props = async () => pinned;

	const el = await window.cc_components?.props({ title: "ignored" });
	expect(el).toBe(pinned);
});
