import { expect, test } from "vitest";

import "../../_fixtures/astro/dist/_astro/live-editing.js";

test("a React component renders to static HTML through the Astro SSR pipeline", async () => {
	const el = await window.cc_components?.["astro-react-static"]({});

	expect(el?.querySelector(".react-static")).toBeTruthy();
	expect(el?.querySelector(".react-static h2")?.textContent).toBe(
		"Hello from React",
	);
	expect(el?.querySelector(".react-static p")?.textContent).toBe(
		"Static React component inside Astro",
	);
});

test("the rendered static React component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-react-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
