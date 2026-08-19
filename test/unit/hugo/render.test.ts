import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import { setMockFiles } from "../_mocks/cloudcannon";

// The site config mirrors from the CloudCannon API at boot (mirrorSiteConfig);
// the fixture's params carry the brand the card probe reads.
const configFile: MockFile = {
	path: "/config.toml",
	data: {
		get: () =>
			Promise.resolve({
				baseURL: "/",
				title: "Hugo Unit Fixture",
				params: { brand: "Fixture Brand" },
			}),
	},
	get: () => Promise.resolve(""),
	content: { get: () => Promise.resolve("") },
};
setMockFiles([configFile]);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test("the renderer returns an HTMLElement with a <div> root", async () => {
	const el = await window.cc_components?.static({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
});

test("the rendered DOM matches the snapshot for a static component", async () => {
	const el = await window.cc_components?.static({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the partial and match the snapshot", async () => {
	const el = await window.cc_components?.props({
		title: "Hello",
		count: 7,
		tags: ["one", "two"],
	});

	expect(el?.querySelector(".with-props h3")?.textContent).toBe("Hello");
	expect(el?.querySelector(".with-props .count")?.textContent).toBe("7");
	expect(el?.querySelectorAll(".tag")).toHaveLength(2);
	expect(el?.outerHTML).toMatchSnapshot();
});

test("defaults apply when the renderer is called without props", async () => {
	const el = await window.cc_components?.props({});

	expect(el?.querySelector(".with-props h3")?.textContent).toBe("");
	expect(el?.querySelector(".with-props .count")?.textContent).toBe("0");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("site params and markdownify resolve inside editor renders", async () => {
	const el = await window.cc_components?.["card.html"]({
		title: "Card Title",
		body: "Some **bold** body",
		tags: ["alpha"],
	});

	expect(el?.querySelector(".card h2")?.textContent).toBe("Card Title");
	expect(el?.querySelector(".card .body")?.innerHTML).toContain(
		"<strong>bold</strong>",
	);
	expect(el?.querySelector(".card .brand")?.textContent).toBe("Fixture Brand");
	expect(el?.querySelectorAll(".card .tag")).toHaveLength(1);
});
