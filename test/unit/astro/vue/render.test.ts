import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a Vue component renders to static HTML through the Astro SSR pipeline", async () => {
	const el = await window.cc_components?.["astro-vue-static"]({});

	expect(el?.querySelector(".vue-static")).toBeTruthy();
	expect(el?.querySelector(".vue-static h2")?.textContent).toBe(
		"Hello from Vue",
	);
	expect(el?.querySelector(".vue-static p")?.textContent).toBe(
		"Static Vue component inside Astro",
	);
});

test("the rendered Vue component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-vue-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
