import { beforeEach, expect, test, vi } from "vitest";

import { addEditableComponentRenderer } from "../../../helpers/cloudcannon.mjs";
import { EditableComponent } from "../../../nodes";
import type { MockFile } from "../_mocks/cloudcannon";
import { resetMock, setMockFiles } from "../_mocks/cloudcannon";

const POST_PATH = "/src/content/blog/post.md";

const makeFile = (path: string, data: unknown): MockFile => {
	const file: MockFile = {
		path,
		data: { get: () => Promise.resolve(data as any) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
	Object.assign(file, {
		__kind: "file",
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	});
	return file;
};

let source: Record<string, any>;

beforeEach(() => {
	resetMock();
	source = {
		title: "Post",
		date: "2026-09-01T10:30:00+10:00[+10:00]",
		events: [{ start: "2026-09-01T10:30:00+00:00[UTC]" }],
	};
	setMockFiles([makeFile(POST_PATH, source)]);
});

test("a registered component receives stripped datetime props", async () => {
	const received: any[] = [];
	addEditableComponentRenderer("date-card", (props) => {
		received.push(props);
		const el = document.createElement("div");
		el.textContent = new Date(props.date).toISOString();
		return el;
	});

	document.body.innerHTML = `<div id="card" data-editable="component" data-component="date-card" data-prop="@file[${POST_PATH}]"></div>`;
	const component = new EditableComponent(
		document.getElementById("card") as HTMLElement,
	);
	component.connect();

	await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
	expect(received[0]).toEqual({
		title: "Post",
		date: "2026-09-01T10:30:00+10:00",
		events: [{ start: "2026-09-01T10:30:00+00:00" }],
	});
	await vi.waitFor(() =>
		expect(component.element.textContent).toBe("2026-09-01T00:30:00.000Z"),
	);
	expect(source.date).toBe("2026-09-01T10:30:00+10:00[+10:00]");
	expect(source.events[0].start).toBe("2026-09-01T10:30:00+00:00[UTC]");
});
