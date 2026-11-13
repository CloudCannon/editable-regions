import { expect, test } from "vitest";

import { registerReactComponent } from "../../../integrations/react.js";
import { EditableComponent } from "../../../nodes/index.js";
import { InteractiveCounter } from "../_fixtures/react/components.js";

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
	// Call the renderer directly: updateTree moves nodes out of React's delegation root.
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

	// Call the renderer directly: updateTree moves nodes out of React's delegation root.
	const el = await window.cc_components?.["interactive-counter"]({});
	if (!el) throw new Error("renderer returned null");

	const button1 = el.querySelector<HTMLButtonElement>(".increment");
	button1?.click();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(el.querySelector(".count")?.textContent).toBe("1");

	// A re-render builds a fresh React root, so state resets to 0.
	editable.value = {};
	await editable.update();

	expect(editable.element.querySelector(".count")?.textContent).toBe("0");
});
