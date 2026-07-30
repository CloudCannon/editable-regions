import { expect, test } from "vitest";

import "../_fixtures/astro/dist/_astro/live-editing.js";

test("isActionError returns true for an ActionError instance", async () => {
	const el = await window.cc_components?.["astro-actions"]({});

	expect(el?.querySelector(".is-error")?.textContent).toBe("true");
});

test("isActionError returns false for a plain object", async () => {
	const el = await window.cc_components?.["astro-actions"]({});

	expect(el?.querySelector(".is-not-error")?.textContent).toBe("false");
});

test("ActionError exposes the code passed to its constructor", async () => {
	const el = await window.cc_components?.["astro-actions"]({});

	expect(el?.querySelector(".error-code")?.textContent).toBe("BAD_REQUEST");
});
