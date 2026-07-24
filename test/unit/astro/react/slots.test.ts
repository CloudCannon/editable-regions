import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a React component with children renders its shell and slot content through the Astro SSR pipeline", async () => {
	// The React renderer forwards slot content (children) via an
	// astro-static-slot element.
	const el = await window.cc_components?.["astro-react-slotted"]({});

	expect(el?.querySelector(".react-slotted")).toBeTruthy();
	expect(el?.querySelector(".react-slotted h2")?.textContent).toBe(
		"Slotted React",
	);
	// Children content is forwarded from the Astro wrapper.
	expect(el?.querySelector(".react-slotted .slotted")?.textContent).toBe(
		"Slotted from Astro",
	);
});

test("the slotted React component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-react-slotted"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
