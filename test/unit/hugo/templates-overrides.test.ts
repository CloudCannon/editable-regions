import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
	useHugoFixture,
} from "../_helpers/hugo-bundle.js";

// Built fixture bundle — run `npm run test:build-hugo-templates-overrides` first.
useHugoFixture("hugo-templates-overrides");

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

function text(el: HTMLElement | null | undefined): string {
	return (el?.querySelector("p")?.textContent ?? "").trim();
}

test("an overridden component renders its override template", async () => {
	const el = await window.cc_components?.card({});

	expect(text(el)).toBe("override-card");
});

test("override name matching tolerates the .html suffix", async () => {
	const el = await window.cc_components?.["card.html"]({});

	expect(text(el)).toBe("override-card");
});

test("a component without an override still renders its natural partial", async () => {
	const el = await window.cc_components?.static({});

	expect(text(el)).toBe("natural-static");
});
