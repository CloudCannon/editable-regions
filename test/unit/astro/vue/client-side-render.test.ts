import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Vue component with ref is client-side rendered via the CSR queue", async () => {
	// With client:load, the Vue renderer queues CSR. The queue is flushed
	// during registerAstroComponent's wrapper, so the component is mounted
	// with full reactivity by the time the renderer returns.
	const el = await window.cc_components?.["astro-vue-counter"]({});

	// The CSR wrapper div is present, with the Vue component mounted inside.
	const csrWrapper = el?.querySelector("[data-editable-region-csr-id]");
	expect(csrWrapper).toBeTruthy();

	expect(el?.querySelector(".vue-counter")).toBeTruthy();
	expect(el?.querySelector(".vue-counter h2")?.textContent).toBe(
		"Counter inside Astro",
	);
	expect(el?.querySelector(".count")?.textContent).toBe("Count: 0");
});

test("clicking the button updates the component's reactive state", async () => {
	const el = await window.cc_components?.["astro-vue-counter"]({});
	if (!el) throw new Error("renderer returned null");

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

test("the rendered Vue counter matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-vue-counter"]({});

	// Snapshot inner component (excludes Astro-injected scripts/styles and CSR wrapper).
	const inner = el?.querySelector(".vue-counter");
	expect(inner?.outerHTML).toMatchSnapshot();
});

test("client:idle queues CSR and mounts the component with reactivity", async () => {
	const el = await window.cc_components?.["astro-vue-counter-idle"]({});

	expect(el?.querySelector("[data-editable-region-csr-id]")).toBeTruthy();
	expect(el?.querySelector(".vue-counter")).toBeTruthy();
	expect(el?.querySelector(".count")?.textContent).toBe("Count: 0");
});

test("client:visible queues CSR and mounts the component with reactivity", async () => {
	const el = await window.cc_components?.["astro-vue-counter-visible"]({});

	expect(el?.querySelector("[data-editable-region-csr-id]")).toBeTruthy();
	expect(el?.querySelector(".vue-counter")).toBeTruthy();
	expect(el?.querySelector(".count")?.textContent).toBe("Count: 0");
});
