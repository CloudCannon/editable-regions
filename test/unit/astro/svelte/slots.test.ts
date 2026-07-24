import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Svelte component with a children snippet renders its shell and slot content through the SSR pipeline", async () => {
	// The Svelte renderer forwards slot content via createRawSnippet.
	// Without client:, the component is SSR-only (no CSR wrapper).
	const el = await window.cc_components?.["astro-svelte-slotted"]({});

	expect(el?.querySelector(".svelte-slotted")).toBeTruthy();
	expect(el?.querySelector(".svelte-slotted h2")?.textContent).toBe(
		"Slotted Svelte",
	);
	// Children content is forwarded from the Astro wrapper.
	expect(el?.querySelector(".svelte-slotted .slotted")?.textContent).toBe(
		"Slotted from Astro",
	);
});

test("the slotted Svelte component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-svelte-slotted"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
