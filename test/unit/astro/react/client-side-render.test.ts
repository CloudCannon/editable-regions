import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a React component with useState is client-side rendered and interactive through the Astro integration", async () => {
	const element = await window.cc_components?.["astro-react-counter"]({});
	if (!element) throw new Error("renderer returned null");

	const button = element.querySelector<HTMLButtonElement>(".increment");
	expect(button).toBeTruthy();
	button?.click();

	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(element.querySelector(".count")?.textContent).toBe("Count: 1");
});
