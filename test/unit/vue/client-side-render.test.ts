import { expect, test } from "vitest";
import { nextTick } from "vue";

import { registerVueComponent } from "../../../integrations/vue.js";
import { EditableComponent } from "../../../nodes/index.js";
import { InteractiveCounter } from "../_fixtures/vue/interactive-counter.js";

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

test("an interactive Vue component renders with its initial state", async () => {
	registerVueComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const host = editable.element;
	expect(host.querySelector(".interactive-counter")).toBeTruthy();
	expect(host.querySelector(".count")?.textContent).toBe("0");
});

test("clicking the button updates the component's reactive state", async () => {
	registerVueComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const button =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	expect(button).toBeTruthy();
	button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await nextTick();

	expect(editable.element.querySelector(".count")?.textContent).toBe("1");
});

test("interactivity still works after a re-render triggered by update", async () => {
	registerVueComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const button1 =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button1?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await nextTick();
	expect(editable.element.querySelector(".count")?.textContent).toBe("1");

	// A re-render builds a fresh Vue app (state resets to 0) but the old instance stays reactive (1→2).
	editable.value = {};
	await editable.update();

	expect(editable.element.querySelector(".count")?.textContent).toBe("0");

	const button2 =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button2?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await nextTick();
	expect(editable.element.querySelector(".count")?.textContent).toBe("2");
});

test("the re-rendered DOM matches the snapshot", async () => {
	registerVueComponent("interactive-counter", InteractiveCounter);
	const editable = await mountComponent("interactive-counter");

	const button =
		editable.element.querySelector<HTMLButtonElement>(".increment");
	button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await nextTick();
	editable.value = {};
	await editable.update();

	// Snapshot inner HTML: the controls element has a random anchor name.
	const inner = editable.element.querySelector(".interactive-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});
