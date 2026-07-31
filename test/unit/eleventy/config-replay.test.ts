/**
 * The auto-mirror runs the user's real config in the browser. Three ordinary
 * things in a config used to abort that replay, and because the abort is
 * caught and warned about rather than thrown, the only symptom was helpers
 * silently missing from the editor. The fixture config holds all three, with
 * `replaySurvived` registered after them.
 */

import { beforeAll, expect, test } from "vitest";

import { componentsReady } from "../_helpers/live-editing";

import "../_fixtures/eleventy/_site/register-components.js";

beforeAll(componentsReady);

test("the config replay survives its browser hazards", async () => {
	const el = await window.cc_components?.["filters-demo"]({});

	// Present at all → neither `ignores.add(…)` nor the argument-side
	// Node-only plugin call aborted the replay before reaching this filter.
	expect(el?.querySelector("[data-replay-survived]")?.textContent).toBeTruthy();
});

test("Node globals resolve to the injected shim rather than throwing", async () => {
	const el = await window.cc_components?.["filters-demo"]({});

	// `platform`, not `env.NODE_ENV`: esbuild has a built-in define for the
	// latter, so it resolves with or without our shim and proves nothing.
	// Nothing substitutes `platform`, so `"browser"` can only be the shim —
	// Node's real `process` reads `darwin`/`linux`.
	expect(el?.querySelector("[data-replay-survived]")?.textContent).toBe(
		"survived:browser@string",
	);
});
