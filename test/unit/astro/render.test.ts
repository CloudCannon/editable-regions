import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

test("the static renderer returns an HTMLElement matching the snapshot", async () => {
	const el = await window.cc_components?.["astro-static"]({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the Astro component and match the snapshot", async () => {
	const el = await window.cc_components?.["astro-props"]({
		title: "Hello",
		count: 7,
	});

	expect(el?.querySelector(".with-props h3")?.textContent).toBe("Hello");
	expect(el?.querySelector(".with-props .count")?.textContent).toBe("7");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("default props apply when the renderer is called without them", async () => {
	const el = await window.cc_components?.["astro-props"]({});

	expect(el?.querySelector(".with-props h3")?.textContent).toBe("");
	expect(el?.querySelector(".with-props .count")?.textContent).toBe("0");
});
