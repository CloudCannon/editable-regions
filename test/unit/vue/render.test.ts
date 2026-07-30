import { expect, test } from "vitest";

import { registerVueComponent } from "../../../integrations/vue.mjs";
import { CounterComponent, StaticComponent } from "../_fixtures/vue/components";

test("the registered renderer returns an HTMLElement (a <div> root)", async () => {
	registerVueComponent("vue-static", StaticComponent);
	const el = await window.cc_components?.["vue-static"]({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
});

test("the rendered DOM matches the snapshot for a static component", async () => {
	registerVueComponent("vue-static", StaticComponent);
	const el = await window.cc_components?.["vue-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the Vue component and match the snapshot", async () => {
	registerVueComponent("vue-counter", CounterComponent);
	const el = await window.cc_components?.["vue-counter"]({ count: 7 });

	expect(el?.outerHTML).toMatchSnapshot();
});

test("default props apply when the renderer is called without them", async () => {
	registerVueComponent("vue-counter", CounterComponent);
	const el = await window.cc_components?.["vue-counter"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
