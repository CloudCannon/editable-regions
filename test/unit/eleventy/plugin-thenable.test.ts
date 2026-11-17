// A plugin can return a thenable without `.catch`, so the mirror normalises with `Promise.resolve`.

import { expect, test } from "vitest";

import { collectAndRegisterEleventyHelpers } from "../../../integrations/eleventy/browser/collect-config.js";
import { createSharedLiquidEngine } from "../../../integrations/liquid/index.js";

test("a plugin returning a non-native thenable is waited on", async () => {
	const engine = createSharedLiquidEngine();

	await collectAndRegisterEleventyHelpers((eleventyConfig: any) => {
		eleventyConfig.addPlugin(() => ({
			// biome-ignore lint/suspicious/noThenProperty: the case under test
			then(resolve: () => void) {
				setTimeout(() => {
					// Registered after the replay returns, so it only lands if the thenable was drained.
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
