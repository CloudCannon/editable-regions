import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("the eleventy global is registered with version, generator, and env", async () => {
	const el = await window.cc_components?.["globals-demo"]({});

	expect(
		el?.querySelector("[data-eleventy-version]")?.textContent,
	).toBeTruthy();
	expect(el?.querySelector("[data-eleventy-generator]")?.textContent).toMatch(
		/^Eleventy v/,
	);
	expect(el?.querySelector("[data-eleventy-runmode]")?.textContent).toBe(
		"serve",
	);
});

test("the pkg global exposes the fixture's package.json", async () => {
	const el = await window.cc_components?.["globals-demo"]({});

	expect(el?.querySelector("[data-pkg-name]")?.textContent).toBe(
		"eleventy-unit-fixture",
	);
	expect(el?.querySelector("[data-pkg-version]")?.textContent).toBe("0.0.1");
});

test("custom globals from pluginOptions.globals are registered", async () => {
	const el = await window.cc_components?.["globals-demo"]({});

	expect(el?.querySelector("[data-env-node]")?.textContent).toBe("test");
	expect(el?.querySelector("[data-env-site]")?.textContent).toBe("fixture");
});
