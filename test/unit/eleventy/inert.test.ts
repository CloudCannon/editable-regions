// No fixture bundle on purpose: importing it would run a config replay with side effects.

import { expect, test } from "vitest";

import { createInertValue } from "../../../integrations/eleventy/browser/inert.js";

test("property access, calls and construction all return the stand-in", () => {
	const inert = createInertValue();

	expect(typeof inert.ignores.add).toBe("function");
	expect(() => inert.ignores.add("x")).not.toThrow();
	expect(typeof inert.a.b.c.d()).toBe("function");
	expect(typeof new inert()).toBe("function");
});

test("`then` is undefined so the stand-in can never look thenable", async () => {
	const inert = createInertValue();

	// `collect-config.ts` treats a callable `.then` as a promise, so a thenable stand-in hangs the mirror.
	expect(inert.then).toBeUndefined();

	const outcome = await Promise.race([
		Promise.resolve(inert).then(() => "settled"),
		new Promise((resolve) => setTimeout(() => resolve("hung"), 50)),
	]);
	expect(outcome).toBe("settled");
});

test("string coercion yields an empty string rather than throwing", () => {
	const inert = createInertValue();

	// Without a `Symbol.toPrimitive` answer this degrades to a proxy and throws.
	expect(`${inert}`).toBe("");
	expect(String(inert.some.path)).toBe("");
});

test("iteration yields nothing rather than throwing", () => {
	const inert = createInertValue();

	expect([...inert]).toEqual([]);
	expect([...inert.readdirSync("src")]).toEqual([]);
});
