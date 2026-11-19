import { expect, test } from "vitest";

import "../_fixtures/svelte4/dist/live-editing.js";

test("renders a real Svelte 4 component without flushSync", async () => {
	const el = await window.cc_components?.["svelte4-greeting"]({
		name: "Svelte 4",
	});

	expect(el?.querySelector(".greeting")?.textContent).toBe("Hello Svelte 4");
});
