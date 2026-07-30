import { flushSync } from "svelte";
import { expect, test } from "vitest";

import { registerSvelteComponent } from "../../../integrations/svelte.mjs";
import { EditableComponent } from "../../../nodes/index.ts";
import { InteractiveCounter } from "../_fixtures/svelte/components";

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

test("an interactive Svelte component renders with its initial state", async () => {
	registerSvelteComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const host = editable.element;
	expect(host.querySelector(".interactive-counter")).toBeTruthy();
	expect(host.querySelector(".count")?.textContent).toBe("0");
});

test("clicking the button updates the component's reactive state", async () => {
	registerSvelteComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const button =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	expect(button).toBeTruthy();
	button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();

	expect(editable.element.querySelector(".count")?.textContent).toBe("1");
});

test("the rendered interactive component matches the snapshot", async () => {
	registerSvelteComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const inner = editable.element.querySelector(".interactive-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});

test("interactivity still works after a re-render triggered by update", async () => {
	registerSvelteComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	// Interact once to prove the component is live
	const button1 =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button1?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
	expect(editable.element.querySelector(".count")?.textContent).toBe("1");

	// Re-render creates a fresh Svelte mount, so state resets to 0. But the
	// original instance survives and stays reactive — a click increments
	// its surviving state (1→2). See TODO.md for details.
	editable.value = {};
	await editable.update();

	expect(editable.element.querySelector(".count")?.textContent).toBe("0");

	const button2 =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button2?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
	expect(editable.element.querySelector(".count")?.textContent).toBe("2");
});

test("the re-rendered DOM matches the snapshot", async () => {
	registerSvelteComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const button =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
	editable.value = {};
	await editable.update();

	const inner = editable.element.querySelector(".interactive-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});
