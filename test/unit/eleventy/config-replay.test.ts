// The fixture config holds three hazards that used to silently abort the browser config replay.

import { beforeAll, expect, test } from "vitest";

import { componentsReady } from "../_helpers/live-editing.js";

import "../_fixtures/eleventy/_site/register-components.js";

beforeAll(componentsReady);

test("the config replay survives its browser hazards", async () => {
	const el = await window.cc_components?.["filters-demo"]({});

	// Replay aborts are caught and warned, so presence is the only signal.
	expect(el?.querySelector("[data-replay-survived]")?.textContent).toBeTruthy();
});

test("Node globals resolve to the injected shim rather than throwing", async () => {
	const el = await window.cc_components?.["filters-demo"]({});

	// `platform` has no esbuild define, unlike `NODE_ENV`, so "browser" can only be the shim.
	expect(el?.querySelector("[data-replay-survived]")?.textContent).toBe(
		"survived:browser@string",
	);
});
