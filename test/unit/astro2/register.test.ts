import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro2-fixture` first.
import "../_fixtures/astro2/dist/_astro/live-editing.js";

test("renders an Astro 2 component", async () => {
	const el = await window.cc_components?.["astro2-greeting"]({
		name: "Astro 2",
	});

	expect(el?.querySelector(".greeting")?.textContent).toBe("Hello Astro 2");
});

test("renders Astro 2 slots without escaping them", async () => {
	const el = await window.cc_components?.["astro2-slot"]({});
	const inner = el?.querySelector(".wrapper .inner");

	expect(inner?.textContent).toBe("slot content");
	expect(inner?.tagName).toBe("P");
});

test("defines ENV_CLIENT and the legacy collections mode", () => {
	expect((window as any).__envClient).toBe(true);
	expect((window as any).__collectionsMode).toBe("legacy");
});
