// @vitest-environment node
// SSR server bundles (Next.js, Nuxt, SvelteKit) evaluate these entries in Node, so `helpers/cloudcannon.ts` must not touch `window` or `document`.

import { expect, test, vi } from "vitest";

test("the CloudCannon helper module evaluates without window or document", async () => {
	vi.resetModules();

	const module = await import("../../helpers/cloudcannon.js");

	expect(module.apiLoadedPromise).toBeInstanceOf(Promise);
	expect(typeof module.addEditableComponentRenderer).toBe("function");
	expect(typeof module.realizeAPIValue).toBe("function");
	expect(module.CloudCannon).toBeUndefined();
});

test("importing the vue and svelte integration entries evaluates in Node", async () => {
	vi.resetModules();

	const vue = await import("../../integrations/vue.js");
	const svelte = await import("../../integrations/svelte/index.js");
	const react = await import("../../integrations/react.js");

	expect(typeof vue.registerVueComponent).toBe("function");
	expect(vue.EditableRegions).toBeTypeOf("object");
	expect(typeof svelte.registerSvelteComponent).toBe("function");
	expect(svelte.EditableRegions).toBeDefined();
	expect(typeof react.registerReactComponent).toBe("function");
	expect(typeof react.EditableRegions).toBe("function");
});
