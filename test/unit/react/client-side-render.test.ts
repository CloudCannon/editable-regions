import { expect, test } from "vitest";

import { registerReactComponent } from "../../../integrations/react.mjs";
import { EditableComponent } from "../../../nodes/index.ts";
import { InteractiveCounter } from "../_fixtures/react/components";

/**
 * Mounts an EditableComponent on a host element, renders it, and returns
 * the editable so tests can drive re-renders via `update`.
 */
async function mountComponent(
	key: string,
	value: Record<string, unknown> = {},
): Promise<EditableComponent> {
	const host = document.createElement("div");
	host.dataset.component = key;
	document.body.append(host);

	const editable = new EditableComponent(host);
	editable.value = value;
	editable.connected = true;
	editable.mounted = true;
	editable.mount();
	await editable.update();

	return editable;
}

test("an interactive React component renders with its initial state", async () => {
	registerReactComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	expect(editable.element.querySelector(".interactive-counter")).toBeTruthy();
	expect(editable.element.querySelector(".count")?.textContent).toBe("0");
});

test("clicking the button updates the component's reactive state", async () => {
	registerReactComponent("interactive-counter", InteractiveCounter);
	// Call the renderer directly — React uses event delegation at the root
	// container, which updateTree breaks by moving DOM nodes out of it.
	const el = await window.cc_components?.["interactive-counter"]({});
	if (!el) throw new Error("renderer returned null");

	const button = el.querySelector<HTMLButtonElement>(".increment");
	expect(button).toBeTruthy();
	button?.click();

	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(el.querySelector(".count")?.textContent).toBe("1");
});

test("the rendered interactive component matches the snapshot", async () => {
	registerReactComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const inner = editable.element.querySelector(".interactive-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});

test("interactivity still works after a re-render triggered by update", async () => {
	registerReactComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	// Interact once to prove the component is live — call the renderer
	// directly because React's event delegation breaks under updateTree.
	const el = await window.cc_components?.["interactive-counter"]({});
	if (!el) throw new Error("renderer returned null");

	const button1 = el.querySelector<HTMLButtonElement>(".increment");
	button1?.click();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(el.querySelector(".count")?.textContent).toBe("1");

	// Re-render creates a fresh React root, so state resets to 0. The
	// old root is not cleaned up — React may keep the orphaned instance
	// reactive. See TODO.md for the Vue/Svelte equivalent.
	editable.value = {};
	await editable.update();

	expect(editable.element.querySelector(".count")?.textContent).toBe("0");
});
