import { expect, test } from "vitest";

import "../_fixtures/svelte3/dist/live-editing.js";

test("renders a real Svelte 3 component", async () => {
	const el = await window.cc_components?.["svelte3-greeting"]({
		name: "Svelte 3",
	});

	expect(el?.querySelector(".greeting")?.textContent).toBe("Hello Svelte 3");
});

test("renders EditableRegions with a dynamic tag on Svelte 3", async () => {
	const el = await window.cc_components?.["svelte3-editable-regions"]({});
	const section = el?.querySelector("section[data-editable='_dynamic']");

	expect(section).toBeTruthy();
	expect(section?.getAttribute("data-extra")).toBe("ok");
	expect(el?.querySelector(".inner")?.textContent).toBe("hello");
});
