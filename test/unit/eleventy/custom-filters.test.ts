import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("an auto-mirrored filter (addFilter) renders correctly in a component", async () => {
	const el = await window.cc_components?.["filters-demo"]({
		shoutInput: "hello",
	});

	expect(el?.querySelector("[data-shout]")?.textContent).toBe("HELLO");
});

test("an auto-mirrored async filter (addAsyncFilter) renders correctly", async () => {
	const el = await window.cc_components?.["filters-demo"]({
		shoutInput: "hello",
	});

	expect(el?.querySelector("[data-async-reverse]")?.textContent).toBe("olleh");
});

test("an auto-mirrored filter that closes over module scope renders correctly", async () => {
	const el = await window.cc_components?.["filters-demo"]({
		stampInput: "hello",
	});

	// The stamp filter closes over `buildInfo` — the closure survives bundling.
	expect(el?.querySelector("[data-stamp]")?.textContent).toMatch(
		/^hello \[fixture@/,
	);
});

test("a filter override (readmeSize) replaces the non-portable server filter", async () => {
	const el = await window.cc_components?.["filters-demo"]({});

	// Server-side, readmeSize calls fs.statSync. Browser override returns "—".
	expect(el?.querySelector("[data-readme-size]")?.textContent).toBe("—");
});

test("layer precedence: Liquid-specific filter wins over universal on name collision", async () => {
	const el = await window.cc_components?.["filters-demo"]({
		doublerInput: 5,
	});

	// `doubler` is registered via both addFilter (universal) and
	// addLiquidFilter (liquid). The Liquid layer wins.
	expect(el?.querySelector("[data-doubler]")?.textContent).toBe("liquid:10");
});

test("builtin filter names are skipped — config filter doesn't clobber the browser port", async () => {
	const el = await window.cc_components?.["filters-demo"]({
		slugInput: "hello world",
	});

	// The config registers addFilter("slug", ...) but the builtin browser
	// port wins (config version is skipped during mirroring).
	expect(el?.querySelector("[data-slug]")?.textContent).toBe("hello-world");
});
