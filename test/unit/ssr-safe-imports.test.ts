// @vitest-environment node
/**
 * The framework integration entries (vue, svelte, react) are evaluated in
 * Node during SSR — Next.js, Nuxt and SvelteKit all import them into their
 * server bundles. `helpers/cloudcannon.mjs` must therefore evaluate without
 * `window` or `document`.
 */

import { expect, test, vi } from "vitest";

test("the CloudCannon helper module evaluates without window or document", async () => {
	vi.resetModules();

	const module = await import("../../helpers/cloudcannon.mjs");

	expect(module.apiLoadedPromise).toBeInstanceOf(Promise);
	expect(typeof module.addEditableComponentRenderer).toBe("function");
	expect(typeof module.realizeAPIValue).toBe("function");
	expect(module.CloudCannon).toBeUndefined();
});

test("importing the vue and svelte integration entries evaluates in Node", async () => {
	vi.resetModules();

	const vue = await import("../../integrations/vue.mjs");
	const svelte = await import("../../integrations/svelte/index.mjs");
	const react = await import("../../integrations/react.mjs");

	expect(typeof vue.registerVueComponent).toBe("function");
	expect(vue.EditableRegions).toBeTypeOf("object");
	expect(typeof svelte.registerSvelteComponent).toBe("function");
	expect(svelte.EditableRegions).toBeDefined();
	expect(typeof react.registerReactComponent).toBe("function");
	expect(typeof react.EditableRegions).toBe("function");
});
