import { expect, test } from "vitest";

import "../_fixtures/astro/dist/_astro/live-editing.js";

test("getRelativeLocaleUrl returns a locale-prefixed relative URL", async () => {
	const el = await window.cc_components?.["astro-i18n"]({
		locale: "es",
		path: "about",
	});

	expect(el?.querySelector(".relative-url")?.textContent).toBe("/es/about/");
});

test("getAbsoluteLocaleUrl returns an absolute URL with the site origin", async () => {
	const el = await window.cc_components?.["astro-i18n"]({
		locale: "es",
		path: "about",
	});

	expect(el?.querySelector(".absolute-url")?.textContent).toBe(
		"https://example.com/es/about/",
	);
});
