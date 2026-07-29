import { expect, test } from "vitest";

import "../_fixtures/astro/dist/_astro/live-editing.js";

test("defineMiddleware returns a function", async () => {
	const el = await window.cc_components?.["astro-middleware"]({});

	expect(el?.querySelector(".middleware-type")?.textContent).toBe("function");
});

test("sequence returns a function", async () => {
	const el = await window.cc_components?.["astro-middleware"]({});

	expect(el?.querySelector(".sequence-type")?.textContent).toBe("function");
});
