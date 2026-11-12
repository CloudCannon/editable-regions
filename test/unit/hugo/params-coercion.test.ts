import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

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

function lines(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

test("props keep exact key casing and numeric types through the front-matter round-trip", async () => {
	const el = await window.cc_components?.["coercion-probe"](props);

	expect(lines(el)).toBe(
		[
			"dotCamel=camelValue",
			"camelExact=camelValue",
			"camelLower=camelValue", // `index` is case-insensitive on params
			"nestedExact=nestedValue",
			"nestedLower=nestedValue",
			"date=string=2024-01-15",
			"datetime=string=2024-01-15T10:30:00Z",
			"count=uint64=7", // whole numbers stay ints (uint64 via YAML parse)
			"countFmt=7",
			"ratio=float64=1.5",
			"big=uint64=9999999999",
			"flag=bool=true",
			"text=plain text",
		].join("\n"),
	);
});
