/**
 * Renderer tests for `templates_overrides`: a key path -> source path map whose
 * source contents are copied over the template snapshot at the key path, so an
 * overridden component renders through Hugo's normal partial lookup — no
 * bespoke override handling in the renderer.
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
