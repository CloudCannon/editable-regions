import { expect, test } from "vitest";

import "../_fixtures/vue2/dist/live-editing.js";

test("renders a real Vue 2 component", async () => {
	const el = await window.cc_components?.["vue2-greeting"]({ name: "Vue 2" });

	expect(el?.querySelector(".greeting")?.textContent).toBe("Hello Vue 2");
});

test("EditableRegions forwards attrs, class, and slots on Vue 2", async () => {
	const el = await window.cc_components?.["vue2-editable-regions"]({
		message: "hello",
	});
	const section = el?.querySelector("section");

	expect(section?.getAttribute("data-editable")).toBe("_dynamic");
	expect(section?.getAttribute("data-prop")).toBe("");
	expect(section?.classList.contains("outer")).toBe(true);
	expect(section?.classList.contains("dynamic")).toBe(true);
	expect(section?.className.match(/dynamic/g)).toHaveLength(1);
	expect((section as HTMLElement | null)?.style.color).toBe("red");
	expect(section?.getAttribute("data-extra")).toBe("ok");
	expect(el?.querySelector(".inner")?.textContent?.trim()).toBe("hello 0");
});

test("EditableRegions forwards Vue 2 custom listeners", async () => {
	const el = await window.cc_components?.["vue2-editable-regions"]({
		message: "clicked",
	});

	el?.querySelector("section")?.dispatchEvent(
		new Event("click", { bubbles: true }),
	);
	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(el?.querySelector(".inner")?.textContent?.trim()).toBe("clicked 1");
});

test("EditableRegions connects to the rendered element on mount", async () => {
	const instances: Array<{ element: Element }> = [];

	class MockEditable {
		element: Element;

		constructor(element: Element) {
			this.element = element;
			instances.push(this);
		}

		connect() {}
		disconnect() {}
	}

	(window as any).editableRegions = { Editable: MockEditable };

	try {
		const el = await window.cc_components?.["vue2-editable-regions"]({
			message: "ref",
		});

		expect(instances).toHaveLength(1);
		expect(instances[0].element).toBe(el?.querySelector("section"));
	} finally {
		delete (window as any).editableRegions;
	}
});
