import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

test("a component with a slot renders its shell with an empty slot", async () => {
	const el = await window.cc_components?.["astro-slot"]({});

	expect(el?.querySelector(".with-slot h2")?.textContent).toBe("Slot");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("the slot component resolves the <slot /> placeholder when no slot content is provided", async () => {
	const el = await window.cc_components?.["astro-slot"]({ title: "Titled" });

	expect(el?.querySelector(".with-slot h2")?.textContent).toBe("Titled");
	expect(el?.querySelector(".with-slot")?.innerHTML).not.toContain("<slot");
});

test("a registered component passes slot content to a child component across the integration boundary", async () => {
	// slot-parent.astro imports with-slot.astro and passes slotted content.
	// Astro's SSR forwards the slot content to the child's <slot />.
	const el = await window.cc_components?.["astro-slot-parent"]({});

	expect(el?.querySelector(".with-slot h2")?.textContent).toBe("From parent");
	const slotted = el?.querySelector(".with-slot .slotted");
	expect(slotted?.textContent).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});
