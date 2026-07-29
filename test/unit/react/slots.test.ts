import { expect, test } from "vitest";

import { registerReactComponent } from "../../../integrations/react.mjs";
import { SlotParent, SlotShell } from "../_fixtures/react/components";

test("a component with children renders its shell gracefully when no child is provided", async () => {
	registerReactComponent("react-slot-shell", SlotShell);
	const el = await window.cc_components?.["react-slot-shell"]({});

	expect(el?.querySelector(".slot-shell")).toBeTruthy();
	expect(el?.querySelector(".slot-shell")?.innerHTML).toBe("");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("a registered component passes children to a child component", async () => {
	registerReactComponent("react-slot-parent", SlotParent);
	const el = await window.cc_components?.["react-slot-parent"]({});

	const shell = el?.querySelector(".slot-shell");
	expect(shell).toBeTruthy();
	const slotted = shell?.querySelector(".slotted");
	expect(slotted?.textContent).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});
