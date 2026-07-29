import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

test("the built bundle registers fixture components on window.cc_components", () => {
	const keys = Object.keys(window.cc_components ?? {});
	// Subset assertion — avoids updating every time a fixture is added.
	const expected = ["astro-static", "astro-props", "astro-slot"];
	for (const key of expected) {
		expect(keys).toContain(key);
	}
});

test("each registered renderer is a function", () => {
	const keys = Object.keys(window.cc_components ?? {});
	for (const key of keys) {
		expect(typeof window.cc_components?.[key]).toBe("function");
	}
});
