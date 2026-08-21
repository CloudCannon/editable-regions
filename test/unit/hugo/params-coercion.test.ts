/**
 * Bundle-path tests for props-to-renderer coercion: the renderer writes
 * component props as YAML front matter on the stub content file, and the
 * editor layout hands them to the partial as `.Params.cc_props`. This pins the
 * key-casing and value-type shape Hugo's front-matter processing produces
 * (the YAML round-trip fixed the old float64-everywhere JSON behavior).
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** Props covering the coercion-sensitive surface. */
const props = {
	camelCaseKey: "camelValue",
	nested: { NestedKey: "nestedValue" },
	date: "2024-01-15",
	datetime: "2024-01-15T10:30:00Z",
	count: 7,
	ratio: 1.5,
	big: 9999999999,
	flag: true,
	text: "plain text",
};

/** The probe partial emits one field per line; strip tags, keep the lines. */
function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("props keep exact key casing and numeric types through the front-matter round-trip", async () => {
	const el = await window.cc_components?.["coercion-probe"](props);

	expect(lines(el)).toBe(
		[
			"dotCamel=camelValue", // dotted access matches the exact original key
			"camelExact=camelValue",
			"camelLower=camelValue", // `index` is case-insensitive on params
			"nestedExact=nestedValue",
			"nestedLower=nestedValue",
			"date=string=2024-01-15", // date-looking strings stay strings
			"datetime=string=2024-01-15T10:30:00Z",
			"count=uint64=7", // whole numbers stay ints (uint64 via YAML parse)
			"countFmt=7", // and printf "%d" works
			"ratio=float64=1.5", // fractions remain floats
			"big=uint64=9999999999", // no scientific notation for large ints
			"flag=bool=true",
			"text=plain text",
		].join("\n"),
	);
});
