import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("an auto-mirrored custom tag (addLiquidTag) renders correctly in a component", async () => {
	const el = await window.cc_components?.["tags-demo"]({
		echoValue: "hello echo",
	});

	expect(el?.querySelector("[data-echo]")?.textContent).toBe("hello echo");
});

test("a custom tag override (diskTag) replaces the non-portable server tag", async () => {
	const el = await window.cc_components?.["tags-demo"]({
		echoValue: "test",
	});

	// Server-side, diskTag reads from disk. Browser override renders a placeholder.
	expect(el?.querySelector("[data-disk-tag]")?.textContent).toBe(
		"disk-tag-override",
	);
});
