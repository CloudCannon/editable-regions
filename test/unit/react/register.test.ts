import { expect, test } from "vitest";

import { registerReactComponent } from "../../../integrations/react.mjs";
import { StaticComponent } from "../_fixtures/react/components";

test("registerReactComponent adds a renderer under the given key on window.cc_components", () => {
	registerReactComponent("react-static", StaticComponent);

	expect(window.cc_components).toBeTruthy();
	expect(typeof window.cc_components?.["react-static"]).toBe("function");
});

test("registerReactComponent overwrites a previously registered key", () => {
	registerReactComponent("react-static", StaticComponent);
	const first = window.cc_components?.["react-static"];

	registerReactComponent("react-static", StaticComponent);
	const second = window.cc_components?.["react-static"];

	expect(second).not.toBe(first);
});
