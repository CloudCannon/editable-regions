import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Svelte component with $state is client-side rendered via the CSR queue", async () => {
	// With client:load, the Svelte renderer queues CSR. The queue is flushed
	// during registerAstroComponent's wrapper, so the component is mounted
	// with full reactivity by the time the renderer returns.
	const el = await window.cc_components?.["astro-svelte-counter"]({});

	// The CSR wrapper div is present, with the Svelte component mounted inside.
	const csrWrapper = el?.querySelector("[data-editable-region-csr-id]");
	expect(csrWrapper).toBeTruthy();

	expect(el?.querySelector(".svelte-counter")).toBeTruthy();
	expect(el?.querySelector(".svelte-counter h2")?.textContent).toBe(
		"Counter inside Astro",
	);
	expect(el?.querySelector(".count")?.textContent).toBe("Count: 0");
});

test("clicking the button updates the component's reactive state", async () => {
	const el = await window.cc_components?.["astro-svelte-counter"]({});
	if (!el) throw new Error("renderer returned null");

	// Append to the real document so Svelte's document-level event delegation
	// catches bubbled events.
	document.body.append(el);

	try {
		const button = el.querySelector<HTMLButtonElement>(".increment");
		expect(button).toBeTruthy();
		button?.click();

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(el.querySelector(".count")?.textContent).toBe("Count: 1");
	} finally {
		el.remove();
	}
});

test("the rendered Svelte counter matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-svelte-counter"]({});

	// Snapshot inner component (excludes Astro-injected scripts/styles and CSR wrapper).
	const inner = el?.querySelector(".svelte-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});
