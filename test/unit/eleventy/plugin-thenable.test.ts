/**
 * A plugin can return a thenable that isn't a native promise — `.then` without
 * `.catch` — so the mirror normalizes with `Promise.resolve` before waiting
 * on one.
 */

import { expect, test } from "vitest";

import { collectAndRegisterEleventyHelpers } from "../../../integrations/eleventy/browser/collect-config.mjs";
import { createSharedLiquidEngine } from "../../../integrations/liquid/index.mjs";

test("a plugin returning a non-native thenable is waited on", async () => {
	const engine = createSharedLiquidEngine();

	await collectAndRegisterEleventyHelpers((eleventyConfig: any) => {
		eleventyConfig.addPlugin(() => ({
			// biome-ignore lint/suspicious/noThenProperty: the case under test
			then(resolve: () => void) {
				setTimeout(() => {
					// After the replay returns, so it only lands if the thenable was
					// drained before the registration pass.
					eleventyConfig.addFilter("thenableLate", (v: string) => `late:${v}`);
					resolve();
				}, 0);
			},
		}));
	});

	expect(await engine.parseAndRender("{{ 'a' | thenableLate }}")).toBe(
		"late:a",
	);
});
