import { expect, test } from "vitest";

import { registerSvelteComponent } from "../../../integrations/svelte.mjs";
import { SlotParent, SlotShell } from "../_fixtures/svelte/components";

test("a component with a children snippet renders its shell gracefully when no child is provided", async () => {
	registerSvelteComponent("svelte-slot-shell", SlotShell);
	const el = await window.cc_components?.["svelte-slot-shell"]({});

	expect(el?.querySelector(".slot-shell")).toBeTruthy();
	// Svelte renders a comment anchor for an empty snippet — no element children.
	expect(el?.querySelector(".slot-shell")?.children.length).toBe(0);
	expect(el?.outerHTML).toMatchSnapshot();
});

test("a registered component passes snippet content to a child component", async () => {
	registerSvelteComponent("svelte-slot-parent", SlotParent);
	const el = await window.cc_components?.["svelte-slot-parent"]({});

	const shell = el?.querySelector(".slot-shell");
	expect(shell).toBeTruthy();
	const slotted = shell?.querySelector(".slotted");
	expect(slotted?.textContent).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});
