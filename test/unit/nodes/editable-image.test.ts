import { beforeEach, expect, test, vi } from "vitest";

import "../../../components/editable-image-component.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	getMockCustomDataPanels,
	resetMock,
	setMockCurrentFile,
} from "../_mocks/cloudcannon.js";

interface InputConfigGate {
	open: () => void;
	callCount: () => number;
}

// Holds every `get-input-config` answer behind a gate so a test can click while the config is in flight; the calls are sequential, so opening once releases all.
function mockCurrentFile(data: Record<string, any>): InputConfigGate {
	let opened = false;
	let callCount = 0;
	const waiting: (() => void)[] = [];

	const file: MockFile = {
		path: "/src/pages/index.md",
		data: { get: () => Promise.resolve(data) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
		getInputConfig: async ({ slug }) => {
			callCount += 1;
			if (!opened) {
				await new Promise<void>((resolve) => waiting.push(resolve));
			}
			return { label: `Label for ${slug}` };
		},
	};

	Object.assign(file, {
		__kind: "file",
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	});
	setMockCurrentFile(file);

	return {
		open: () => {
			opened = true;
			for (const resolve of waiting.splice(0)) {
				resolve();
			}
		},
		callCount: () => callCount,
	};
}

async function mountImageRegion(): Promise<HTMLImageElement> {
	const region = document.createElement("editable-image");
	region.dataset.prop = "image";
	const image = document.createElement("img");
	region.appendChild(image);
	document.body.appendChild(region);

	await vi.waitFor(() => expect(region.editable.mounted).toBe(true));

	return image;
}

beforeEach(() => {
	document.body.replaceChildren();
	resetMock();
});

test("a click while the input config is loading still opens the panel", async () => {
	const gate = mockCurrentFile({
		image: { src: "image.png", alt: "An image", title: "Image Title" },
	});
	const image = await mountImageRegion();

	await vi.waitFor(() => expect(gate.callCount()).toBeGreaterThan(0));
	image.click();
	expect(getMockCustomDataPanels()).toHaveLength(0);

	gate.open();

	await vi.waitFor(() => expect(getMockCustomDataPanels()).toHaveLength(1));
	const [panel] = getMockCustomDataPanels();
	expect(panel.data).toEqual({
		src: "image.png",
		alt: "An image",
		title: "Image Title",
	});
	expect(panel.config._inputs.src.label).toBe("Label for image.src");
	expect(panel.config._inputs.alt.label).toBe("Label for image.alt");
	expect(panel.config._inputs.title.label).toBe("Label for image.title");
});

test("a click after the input config has loaded opens the panel", async () => {
	const gate = mockCurrentFile({
		image: { src: "image.png", alt: "An image", title: "Image Title" },
	});
	const image = await mountImageRegion();

	gate.open();
	await vi.waitFor(() => expect(gate.callCount()).toBe(3));

	image.click();

	await vi.waitFor(() => expect(getMockCustomDataPanels()).toHaveLength(1));
	expect(getMockCustomDataPanels()[0].config._inputs.src.label).toBe(
		"Label for image.src",
	);
});
