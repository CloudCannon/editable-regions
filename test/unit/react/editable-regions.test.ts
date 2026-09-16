import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { EditableRegions } from "../../../integrations/react.mjs";

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
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.mocked(console.warn).mockRestore();
});

const roots = [];

const renderRegions = (props, children) => {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	flushSync(() =>
		root.render(
			createElement(
				EditableRegions,
				props,
				children ? createElement("p", { className: "inner" }, "content") : null,
			),
		),
	);
	roots.push(root);
	return container;
};

afterEach(() => {
	while (roots.length > 0) {
		roots.pop()?.unmount();
	}
});

const renderedRegion = (container: Element) =>
	container.querySelector("[data-editable='_dynamic']") as HTMLElement;

test("renders a div marked _dynamic with forwarded attributes and children", () => {
	const container = renderRegions(
		{ className: "wrapper", id: "page-root", "aria-label": "page" },
		true,
	);

	const el = renderedRegion(container);
	expect(el?.tagName).toBe("DIV");
	expect(el?.className).toBe("wrapper");
	expect(el?.id).toBe("page-root");
	expect(el?.getAttribute("aria-label")).toBe("page");
	expect(el?.getAttribute("data-editable")).toBe("_dynamic");
	expect(el?.querySelector("p.inner")?.textContent).toBe("content");
});

test("renders a custom element type when the tag prop is set", () => {
	const container = renderRegions({ tag: "section" });

	expect(renderedRegion(container)?.tagName).toBe("SECTION");
});

test("hardcodes an empty data-prop so descendants resolve against the current file", () => {
	const container = renderRegions({});

	expect(renderedRegion(container)?.getAttribute("data-prop")).toBe("");
});

test("drops user-supplied data-prop and data-literal attributes", () => {
	const container = renderRegions({
		"data-prop": "title",
		"data-prop-heading": "heading",
		"data-literal-count": "3",
	});

	const el = renderedRegion(container);
	expect(el?.getAttribute("data-prop")).toBe("");
	expect(el?.getAttribute("data-prop-heading")).toBeNull();
	expect(el?.getAttribute("data-literal-count")).toBeNull();
});

test("connects a base editable node to the rendered element after mount", async () => {
	(window as any).editableRegions = { Editable: MockEditable };
	const container = renderRegions({});

	const el = renderedRegion(container);
	await vi.waitFor(() => expect(MockEditable.instances[0]?.element).toBe(el));
	expect(MockEditable.instances).toHaveLength(1);
	expect(MockEditable.instances[0].connectCount).toBe(1);
});

test("does nothing until the editable regions script loads", async () => {
	const container = renderRegions({});

	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(MockEditable.instances).toHaveLength(0);
	expect(renderedRegion(container)).not.toBeNull();

	(window as any).editableRegions = { Editable: MockEditable };
	document.dispatchEvent(new CustomEvent("editable-regions:load"));

	await vi.waitFor(() =>
		expect(MockEditable.instances[0]?.element).toBe(renderedRegion(container)),
	);
});

test("ignores the load event after unmount", async () => {
	const container = renderRegions({});
	await vi.waitFor(() => expect(renderedRegion(container)).not.toBeNull());

	const root = roots[0];
	root.unmount();
	roots.length = 0;

	(window as any).editableRegions = { Editable: MockEditable };
	document.dispatchEvent(new CustomEvent("editable-regions:load"));
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(MockEditable.instances).toHaveLength(0);
});

test("disconnects on unmount", async () => {
	(window as any).editableRegions = { Editable: MockEditable };
	renderRegions({});

	await vi.waitFor(() =>
		expect(MockEditable.instances[0]?.connectCount).toBe(1),
	);

	const root = roots[0];
	root.unmount();
	roots.length = 0;
	expect(MockEditable.instances[0].disconnectCount).toBe(1);
});
