import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Vue component with a <slot /> renders its shell and slot content through the Astro SSR pipeline", async () => {
	// The Vue renderer forwards slot content via render functions that
	// produce astro-static-slot elements.
	const el = await window.cc_components?.["astro-vue-slotted"]({});

	expect(el?.querySelector(".vue-slotted")).toBeTruthy();
	expect(el?.querySelector(".vue-slotted h2")?.textContent).toBe("Slotted Vue");
	// Slot content is forwarded from the Astro wrapper.
	expect(el?.querySelector(".vue-slotted .slotted")?.textContent).toBe(
		"Slotted from Astro",
	);
});

test("the slotted Vue component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-vue-slotted"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
