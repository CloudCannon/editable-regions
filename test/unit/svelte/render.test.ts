import { expect, test } from "vitest";

import { registerSvelteComponent } from "../../../integrations/svelte.mjs";
import {
	CounterComponent,
	StaticComponent,
} from "../_fixtures/svelte/components";

test("the registered renderer returns an HTMLElement (a <div> root)", async () => {
	registerSvelteComponent("svelte-static", StaticComponent);
	const el = await window.cc_components?.["svelte-static"]({});

	expect(el).toBeInstanceOf(HTMLElement);
	expect(el?.tagName).toBe("DIV");
});

test("the rendered DOM matches the snapshot for a static component", async () => {
	registerSvelteComponent("svelte-static", StaticComponent);
	const el = await window.cc_components?.["svelte-static"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("props passed to the renderer reach the Svelte component and match the snapshot", async () => {
	registerSvelteComponent("svelte-counter", CounterComponent);
	const el = await window.cc_components?.["svelte-counter"]({ count: 7 });

	expect(el?.outerHTML).toMatchSnapshot();
});

test("default props apply when the renderer is called without them", async () => {
	registerSvelteComponent("svelte-counter", CounterComponent);
	const el = await window.cc_components?.["svelte-counter"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});
