/**
 * Renderer tests for `templates_overrides`: a mapped component name renders its
 * override source (a partial outside the layout tree) instead of the
 * naturally-discovered project partial of the same name. The browser mirrors
 * the override source verbatim and passes the name -> path map to the renderer,
 * which maps each name to a reserved partial so the exact file renders
 * regardless of Hugo's partial lookup order.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
	useHugoFixture,
} from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-templates-overrides` first.
useHugoFixture("hugo-templates-overrides");

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The probe partials emit a single `<p>`; read its text. */
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
