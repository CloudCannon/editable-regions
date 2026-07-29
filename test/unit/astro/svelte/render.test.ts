import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Svelte component renders through the Astro SSR pipeline", async () => {
	// Without a client: directive, the Svelte renderer SSR-mounts in a
	// detached document and returns static markup (no CSR wrapper).
	const el = await window.cc_components?.["astro-svelte-static"]({});

	expect(el?.querySelector(".svelte-static")).toBeTruthy();
	expect(el?.querySelector(".svelte-static h2")?.textContent).toBe(
		"Hello from Svelte",
	);
	expect(el?.querySelector(".svelte-static p")?.textContent).toBe(
		"Svelte component inside Astro",
	);
});

test("the rendered Svelte component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-svelte-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
