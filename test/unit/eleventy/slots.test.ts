import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("includeWith spreads a props object into the included partial's scope", async () => {
	// `slot-parent` calls {% includeWith "slot-shell", slotProps %}.
	const el = await window.cc_components?.["slot-parent"]({
		slotProps: { content: "slotted from parent" },
	});

	const shell = el?.querySelector(".slot-shell");
	expect(shell).toBeTruthy();
	expect(shell?.textContent?.trim()).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("a component with includeWith renders its shell gracefully when no props are given", async () => {
	// With no slotProps, the tag returns early — the shell isn't rendered.
	const el = await window.cc_components?.["slot-parent"]({});

	expect(el?.querySelector(".slot-shell")).toBeNull();
	expect(el?.outerHTML).toMatchSnapshot();
});

test("nested includeWith calls resolve correctly (parent → child → grandchild)", async () => {
	// `slot-child` calls {% includeWith "slot-grandchild", childProps %}.
	const el = await window.cc_components?.["slot-child"]({
		childProps: { message: "hello from grandchild" },
	});

	const grandchild = el?.querySelector(".slot-grandchild");
	expect(grandchild).toBeTruthy();
	expect(grandchild?.textContent?.trim()).toBe("hello from grandchild");
});

test("includeWith with a missing path throws an enhanced error", async () => {
	// The proxy resolves `missing-include` as {% include "missing-include" %}.
	await expect(window.cc_components?.["missing-include"]({})).rejects.toThrow(
		/Failed to find included template/,
	);
});
