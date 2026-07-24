import { expect, test } from "vitest";

import { registerSvelteComponent } from "../../../integrations/svelte.mjs";
import { StaticComponent } from "../_fixtures/svelte/components";

test("registerSvelteComponent adds a renderer under the given key on window.cc_components", () => {
	registerSvelteComponent("svelte-static", StaticComponent);

	expect(window.cc_components).toBeTruthy();
	expect(typeof window.cc_components?.["svelte-static"]).toBe("function");
});

test("registerSvelteComponent overwrites a previously registered key", () => {
	registerSvelteComponent("svelte-static", StaticComponent);
	const first = window.cc_components?.["svelte-static"];

	registerSvelteComponent("svelte-static", StaticComponent);
	const second = window.cc_components?.["svelte-static"];

	expect(second).not.toBe(first);
});
