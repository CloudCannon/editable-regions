import { expect, test } from "vitest";

import { registerVueComponent } from "../../../integrations/vue.mjs";
import { SlotParent, SlotShell } from "../_fixtures/vue/components";

test("a component with a slot renders its shell gracefully when no child is provided", async () => {
	registerVueComponent("vue-slot-shell", SlotShell);
	const el = await window.cc_components?.["vue-slot-shell"]({});

	expect(el?.querySelector(".slot-shell")).toBeTruthy();
	expect(el?.querySelector(".slot-shell")?.innerHTML).toBe("");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("a registered component passes slot content to a child component", async () => {
	registerVueComponent("vue-slot-parent", SlotParent);
	const el = await window.cc_components?.["vue-slot-parent"]({});

	const shell = el?.querySelector(".slot-shell");
	expect(shell).toBeTruthy();
	const slotted = shell?.querySelector(".slotted");
	expect(slotted?.textContent).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});
