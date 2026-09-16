import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp, h } from "vue";

import { EditableRegions } from "../../../integrations/vue.mjs";

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

beforeEach(() => {
	MockEditable.instances = [];
	delete (window as any).editableRegions;
	document.body.innerHTML = "";
});

const mountedApps = [];

const mountRegions = (props, slot) => {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const app = createApp({
		render: () => h(EditableRegions, props, slot ? () => slot : undefined),
	});
	app.mount(container);
	mountedApps.push(app);
	return { app, container };
};

afterEach(() => {
	while (mountedApps.length > 0) {
		mountedApps.pop()?.unmount();
	}
});

const renderedRegion = (container: Element) =>
	container.querySelector("[data-editable='_dynamic']") as HTMLElement;

test("renders a div marked _dynamic with forwarded attributes and slot content", () => {
	const { container } = mountRegions(
		{ class: "wrapper", id: "page-root", "aria-label": "page" },
		h("p", { class: "inner" }, "content"),
	);

	const el = renderedRegion(container);
	expect(el?.tagName).toBe("DIV");
	expect(el?.className).toBe("wrapper");
	expect(el?.id).toBe("page-root");
	expect(el?.getAttribute("aria-label")).toBe("page");
	expect(el?.getAttribute("data-editable")).toBe("_dynamic");
	expect(el?.querySelector("p.inner")?.textContent).toBe("content");
});

test("hardcodes an empty data-prop so descendants resolve against the current file", () => {
	const { container } = mountRegions({});

	expect(renderedRegion(container)?.getAttribute("data-prop")).toBe("");
});

test("drops user-supplied data-prop and data-literal attributes", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	const { container } = mountRegions({
		"data-prop": "title",
		"data-prop-heading": "heading",
		"data-literal-count": "3",
	});

	const el = renderedRegion(container);
	expect(el?.getAttribute("data-prop")).toBe("");
	expect(el?.getAttribute("data-prop-heading")).toBeNull();
	expect(el?.getAttribute("data-literal-count")).toBeNull();
	expect(warn).toHaveBeenCalledTimes(1);
	warn.mockRestore();
});

test("renders a custom element type when the tag prop is set", () => {
	const { container } = mountRegions({ tag: "section" });

	expect(renderedRegion(container)?.tagName).toBe("SECTION");
});

test("connects a base editable node to the rendered element on mount", () => {
	(window as any).editableRegions = { Editable: MockEditable };
	const { container } = mountRegions({});

	const el = renderedRegion(container);
	expect(MockEditable.instances).toHaveLength(1);
	expect(MockEditable.instances[0].element).toBe(el);
	expect(MockEditable.instances[0].connectCount).toBe(1);
});

test("does nothing until the editable regions script loads", () => {
	const { container } = mountRegions({});

	expect(MockEditable.instances).toHaveLength(0);
	expect(renderedRegion(container)).not.toBeNull();

	(window as any).editableRegions = { Editable: MockEditable };
	document.dispatchEvent(new CustomEvent("editable-regions:load"));

	expect(MockEditable.instances).toHaveLength(1);
	expect(MockEditable.instances[0].element).toBe(renderedRegion(container));
});

test("ignores the load event after unmount", () => {
	const { app } = mountRegions({});
	app.unmount();

	document.dispatchEvent(new CustomEvent("editable-regions:load"));
	expect(MockEditable.instances).toHaveLength(0);
});

test("disconnects on unmount", () => {
	(window as any).editableRegions = { Editable: MockEditable };
	const { app } = mountRegions({});

	expect(MockEditable.instances[0].disconnectCount).toBe(0);
	app.unmount();
	expect(MockEditable.instances[0].disconnectCount).toBe(1);
});
