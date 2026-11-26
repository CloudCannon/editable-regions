import { expect, test } from "vitest";

import "../../_fixtures/astro-svelte4/dist/_astro/live-editing.js";

test("a real Svelte 4 component renders through the Astro SSR pipeline", async () => {
	const el = await window.cc_components?.["svelte4-static"]({});

	expect(el?.querySelector(".svelte-static h2")?.textContent).toBe(
		"Static from Astro",
	);
	expect(el?.querySelector(".svelte-static p")?.textContent).toBe(
		"Static Svelte 4 component",
	);
});

test("a real Svelte 4 component renders default and named slots", async () => {
	const el = await window.cc_components?.["svelte4-slotted"]({});

	expect(el?.querySelector(".svelte-slotted h2")?.textContent).toBe(
		"Slotted from Astro",
	);
	expect(el?.querySelector(".slotted")?.textContent).toBe(
		"Default slot from Astro",
	);
	expect(el?.querySelector(".slotted-footer")?.textContent).toBe(
		"Footer slot from Astro",
	);
});

test("real Svelte 4 client directives mount and stay reactive", async () => {
	const islands = [
		["svelte4-load", "Load island"],
		["svelte4-idle", "Idle island"],
		["svelte4-visible", "Visible island"],
		["svelte4-media", "Media island"],
	];

	for (const [key, label] of islands) {
		const el = await window.cc_components?.[key]({});
		if (!el) throw new Error(`${key} returned no element`);

		expect(el.querySelector("[data-editable-region-csr-id]")).toBeTruthy();
		expect(el.querySelector(".svelte-counter h2")?.textContent).toBe(label);
		expect(el.querySelector(".count")?.textContent).toBe("Count: 0");
		expect(el.querySelector("astro-island")).toBeFalsy();

		document.body.append(el);

		try {
			el.querySelector<HTMLButtonElement>(".increment")?.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(el.querySelector(".count")?.textContent).toBe("Count: 1");
		} finally {
			el.remove();
		}
	}
});

test("a real Svelte 4 client component hydrates with slots", async () => {
	const el = await window.cc_components?.["svelte4-slotted-load"]({});

	expect(el?.querySelector("[data-editable-region-csr-id]")).toBeTruthy();
	expect(el?.querySelector(".svelte-slotted h2")?.textContent).toBe(
		"Slotted load island",
	);
	expect(el?.querySelector(".slotted")?.textContent).toBe("Default load slot");
	expect(el?.querySelector(".slotted-footer")?.textContent).toBe(
		"Footer load slot",
	);
	expect(el?.querySelector("astro-island")).toBeFalsy();
});

test("defines ENV_CLIENT and the Astro 4 collections mode", () => {
	expect((window as any).__envClient).toBe(true);
	expect((window as any).__collectionsMode).toBe("legacy");
});
