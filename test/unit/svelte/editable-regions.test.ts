import { mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import EditableRegions from "../../../integrations/svelte/EditableRegions.svelte";
import { EditableRegionsShell } from "../_fixtures/svelte/components";

class MockEditable {
	static instances = [];

	element;
	connectCount = 0;
	disconnectCount = 0;

	constructor(element) {
		this.element = element;
		MockEditable.instances.push(this);
	}

	connect() {
		this.connectCount += 1;
	}

	disconnect() {
		this.disconnectCount += 1;
	}
}

const instances = [];

beforeEach(() => {
	MockEditable.instances = [];
	instances.length = 0;
	delete (window as any).editableRegions;
	document.body.innerHTML = "";
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	while (instances.length > 0) {
		unmount(instances.pop());
	}
	vi.mocked(console.warn).mockRestore();
});

/** Mounts a component into a fresh target and tracks it for unmount. */
const render = (component, props = {}) => {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const instance = mount(component, { target, props });
	instances.push(instance);
	return target;
};

const renderedRegion = (target: Element) =>
	target.querySelector("[data-editable='_dynamic']") as HTMLElement;

test("renders a div marked _dynamic with forwarded attributes and slot content", () => {
	const target = render(EditableRegionsShell);

	const el = renderedRegion(target);
	expect(el?.tagName).toBe("DIV");
	expect(el?.className).toBe("wrapper");
	expect(el?.id).toBe("page-root");
	expect(el?.getAttribute("aria-label")).toBe("page");
	expect(el?.getAttribute("data-editable")).toBe("_dynamic");
	expect(el?.querySelector("p.inner")?.textContent).toBe("content");
});

test("renders a custom element type when the tag prop is set", () => {
	const target = render(EditableRegions, { tag: "section" });

	expect(renderedRegion(target)?.tagName).toBe("SECTION");
});

test("hardcodes an empty data-prop so descendants resolve against the current file", () => {
	const target = render(EditableRegions);

	expect(renderedRegion(target)?.getAttribute("data-prop")).toBe("");
});

test("drops user-supplied data-prop and data-literal attributes", () => {
	const target = render(EditableRegions, {
		"data-prop": "title",
		"data-prop-heading": "heading",
		"data-literal-count": "3",
	});

	const el = renderedRegion(target);
	expect(el?.getAttribute("data-prop")).toBe("");
	expect(el?.getAttribute("data-prop-heading")).toBeNull();
	expect(el?.getAttribute("data-literal-count")).toBeNull();
	expect(console.warn).toHaveBeenCalledTimes(1);
});

test("connects a base editable node to the rendered element after mount", async () => {
	(window as any).editableRegions = { Editable: MockEditable };
	const target = render(EditableRegions, {});

	const el = renderedRegion(target);
	await vi.waitFor(() => expect(MockEditable.instances[0]?.element).toBe(el));
	expect(MockEditable.instances).toHaveLength(1);
	expect(MockEditable.instances[0].connectCount).toBe(1);
});

test("does nothing until the editable regions script loads", async () => {
	const target = render(EditableRegions, {});

	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(MockEditable.instances).toHaveLength(0);
	expect(renderedRegion(target)).not.toBeNull();

	(window as any).editableRegions = { Editable: MockEditable };
	document.dispatchEvent(new CustomEvent("editable-regions:load"));

	await vi.waitFor(() =>
		expect(MockEditable.instances[0]?.element).toBe(renderedRegion(target)),
	);
});

test("ignores the load event after unmount", async () => {
	render(EditableRegions, {});
	await vi.waitFor(() => expect(renderedRegion(document.body)).not.toBeNull());

	unmount(instances.pop());
	instances.length = 0;

	(window as any).editableRegions = { Editable: MockEditable };
	document.dispatchEvent(new CustomEvent("editable-regions:load"));
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(MockEditable.instances).toHaveLength(0);
});

test("disconnects on unmount", async () => {
	(window as any).editableRegions = { Editable: MockEditable };
	render(EditableRegions, {});

	await vi.waitFor(() =>
		expect(MockEditable.instances[0]?.connectCount).toBe(1),
	);

	unmount(instances.pop());
	instances.length = 0;
	expect(MockEditable.instances[0].disconnectCount).toBe(1);
});
