import { expect, test } from "vitest";

import "../_fixtures/eleventy/_site/register-components.js";

test("the registered renderer returns an HTMLElement (a <div> root)", async () => {
	const el = await window.cc_components?.static({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
});

test("the rendered DOM matches the snapshot for a static component", async () => {
	const el = await window.cc_components?.static({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the Liquid component and match the snapshot", async () => {
	const el = await window.cc_components?.counter({ count: 7 });

	expect(el?.outerHTML).toMatchSnapshot();
});

test("default props apply when the renderer is called without them", async () => {
	const el = await window.cc_components?.counter({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("the overridden card component renders title and body props", async () => {
	const el = await window.cc_components?.card({
		title: "Card Title",
		body: "Card body text",
	});

	expect(el?.querySelector(".card h3")?.textContent).toBe("Card Title");
	expect(el?.querySelector(".card p")?.textContent).toBe("Card body text");
});
