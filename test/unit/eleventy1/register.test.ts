import { beforeAll, expect, test } from "vitest";

import { componentsReady } from "../_helpers/live-editing.js";

// Built bundle — run `npm run test:build-eleventy1-fixture` first.
import "../_fixtures/eleventy1/_site/register-components.js";

beforeAll(componentsReady);

test("Eleventy 1.x resolves the default component directories", () => {
	const files = Object.keys(window.cc_liquid_files ?? {});

	expect(files).toContain("src/_includes/card.liquid");
	expect(files).toContain("src/index.liquid");
});

test("Eleventy 1.x replays the CommonJS config and renders a component", async () => {
	const el = await window.cc_components?.card({ title: "Eleventy 1" });

	expect(el?.querySelector(".card h3")?.textContent).toBe("ELEVENTY 1");
});
