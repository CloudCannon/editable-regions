import { expect, test } from "vitest";

import { registerVueComponent } from "../../../integrations/vue.mjs";
import { StaticComponent } from "../_fixtures/vue/components";

test("registerVueComponent adds a renderer under the given key on window.cc_components", () => {
	registerVueComponent("vue-static", StaticComponent);

	expect(window.cc_components).toBeTruthy();
	expect(typeof window.cc_components?.["vue-static"]).toBe("function");
});

test("registerVueComponent overwrites a previously registered key", () => {
	registerVueComponent("vue-static", StaticComponent);
	const first = window.cc_components?.["vue-static"];

	registerVueComponent("vue-static", StaticComponent);
	const second = window.cc_components?.["vue-static"];

	expect(second).not.toBe(first);
});
