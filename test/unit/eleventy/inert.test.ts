/**
 * `createInertValue()` backs both the config recorder's unrecorded members and
 * the browser stubs, so it has to absorb anything a config does to it. No
 * fixture bundle here on purpose — this is pure, and importing the bundle
 * would run a config replay with module-level side effects.
 */

import { expect, test } from "vitest";

import { createInertValue } from "../../../integrations/eleventy/browser/inert.mjs";

test("property access, calls and construction all return the stand-in", () => {
	const inert = createInertValue();

	// The `eleventyConfig.ignores.add(…)` shape: reach through, then call.
	expect(typeof inert.ignores.add).toBe("function");
	expect(() => inert.ignores.add("x")).not.toThrow();
	expect(typeof inert.a.b.c.d()).toBe("function");
	expect(typeof new inert()).toBe("function");
});

test("`then` is undefined so the stand-in can never look thenable", async () => {
	const inert = createInertValue();

	// The highest-consequence guard. `collect-config.mjs` treats a plugin
	// result with a callable `.then` as a promise, so a thenable-looking
	// stand-in hangs the mirror — and every render gated on it — forever.
	expect(inert.then).toBeUndefined();

	const outcome = await Promise.race([
		Promise.resolve(inert).then(() => "settled"),
		new Promise((resolve) => setTimeout(() => resolve("hung"), 50)),
	]);
	expect(outcome).toBe("settled");
});

test("string coercion yields an empty string rather than throwing", () => {
	const inert = createInertValue();

	// Without a `Symbol.toPrimitive` answer this walks toPrimitive → valueOf →
	// toString, gets a proxy from each, and throws.
	expect(`${inert}`).toBe("");
	expect(String(inert.some.path)).toBe("");
});

test("iteration yields nothing rather than throwing", () => {
	const inert = createInertValue();

	// e.g. `for (const f of fs.readdirSync(dir))`, where the call was skipped.
	expect([...inert]).toEqual([]);
	expect([...inert.readdirSync("src")]).toEqual([]);
});
