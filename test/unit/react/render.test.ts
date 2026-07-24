import { expect, test } from "vitest";

import { registerReactComponent } from "../../../integrations/react.mjs";
import {
	CounterComponent,
	StaticComponent,
} from "../_fixtures/react/components";

test("the registered renderer returns an HTMLElement (a <div> root)", async () => {
	registerReactComponent("react-static", StaticComponent);
	const el = await window.cc_components?.["react-static"]({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
});

test("the rendered DOM matches the snapshot for a static component", async () => {
	registerReactComponent("react-static", StaticComponent);
	const el = await window.cc_components?.["react-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the React component and match the snapshot", async () => {
	registerReactComponent("react-counter", CounterComponent);
	const el = await window.cc_components?.["react-counter"]({ count: 7 });

	expect(el?.outerHTML).toMatchSnapshot();
});

test("default props apply when the renderer is called without them", async () => {
	registerReactComponent("react-counter", CounterComponent);
	const el = await window.cc_components?.["react-counter"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
