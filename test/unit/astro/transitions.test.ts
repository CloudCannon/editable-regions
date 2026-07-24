import { expect, test } from "vitest";

import "../_fixtures/astro/dist/_astro/live-editing.js";

test("fade renders the component without crashing", async () => {
	const el = await window.cc_components?.["astro-transitions"]({
		animationType: "fade",
	});

	expect(el?.querySelector(".transitions-test")).toBeTruthy();
	expect(el?.querySelector(".animation-type")?.textContent).toBe("fade");
});

test("slide renders the component without crashing", async () => {
	const el = await window.cc_components?.["astro-transitions"]({
		animationType: "slide",
		duration: "1s",
	});

	expect(el?.querySelector(".transitions-test")).toBeTruthy();
	expect(el?.querySelector(".animation-type")?.textContent).toBe("slide");
});
