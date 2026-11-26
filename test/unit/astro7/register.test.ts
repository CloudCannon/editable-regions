import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro7-fixture` first.
import "../_fixtures/astro7/dist/_astro/live-editing.js";

test("renders an Astro 7 component instead of the client stub", async () => {
	const el = await window.cc_components?.["astro7-greeting"]({
		name: "Astro 7",
	});

	expect(el?.querySelector(".greeting")?.textContent).toBe("Hello Astro 7");
});
