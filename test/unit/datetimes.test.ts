import { describe, expect, test } from "vitest";

import {
	stripDatetimeAnnotation,
	stripDatetimeAnnotations,
} from "../../helpers/datetimes.mjs";

describe("stripDatetimeAnnotation", () => {
	test.each([
		["2026-09-01T10:30:00+00:00[UTC]", "2026-09-01T10:30:00+00:00"],
		["2026-09-01T10:30:00+10:00[+10:00]", "2026-09-01T10:30:00+10:00"],
		["2026-09-01T10:30:00.123-05:00[-05:00]", "2026-09-01T10:30:00.123-05:00"],
		["2026-09-01T10:30:00Z[UTC]", "2026-09-01T10:30:00Z"],
		["2026-09-01 10:30:00+10:00[+10:00]", "2026-09-01 10:30:00+10:00"],
		["2026-09-01T10:30+00:00[UTC]", "2026-09-01T10:30+00:00"],
		["2026-09-01T10:30:00+01:00[!Europe/Paris]", "2026-09-01T10:30:00+01:00"],
		["2026-09-01T10:30:00+00:00[!UTC]", "2026-09-01T10:30:00+00:00"],
		[
			"2026-09-01T10:30:00+00:00[UTC][u-ca=iso8601]",
			"2026-09-01T10:30:00+00:00",
		],
	])("strips %s", (input, expected) => {
		const stripped = stripDatetimeAnnotation(input);
		expect(stripped).toBe(expected);
		expect(Number.isNaN(new Date(stripped).getTime())).toBe(false);
	});

	test("keeps the instant", () => {
		expect(
			new Date(
				stripDatetimeAnnotation("2026-09-01T10:30:00+10:00[+10:00]"),
			).toISOString(),
		).toBe("2026-09-01T00:30:00.000Z");
	});

	test.each([
		"2026-09-01T00:00:00Z",
		"2026-09-01",
		"2026-09-02",
		"2026-09-01T10:30:00[UTC]",
		"2026-09-01T10:30:00+00:00[UTC] trailing",
		"foo[bar]",
		"",
	])("leaves %j unchanged", (input) => {
		expect(stripDatetimeAnnotation(input)).toBe(input);
	});
});

describe("stripDatetimeAnnotations", () => {
	test("strips nested strings in arrays and plain objects", () => {
		const input = {
			date: "2026-09-01T10:30:00+00:00[UTC]",
			title: "foo[bar]",
			count: 3,
			draft: false,
			nothing: null,
			events: [
				{ start: "2026-09-01T10:30:00+10:00[+10:00]" },
				"2026-09-01T10:30:00.123-05:00[-05:00]",
			],
			bare: Object.assign(Object.create(null), {
				at: "2026-09-01T10:30:00Z[UTC]",
			}),
		};
		const output = stripDatetimeAnnotations(input);
		expect(output).toEqual({
			date: "2026-09-01T10:30:00+00:00",
			title: "foo[bar]",
			count: 3,
			draft: false,
			nothing: null,
			events: [
				{ start: "2026-09-01T10:30:00+10:00" },
				"2026-09-01T10:30:00.123-05:00",
			],
			bare: expect.objectContaining({ at: "2026-09-01T10:30:00Z" }),
		});
		expect(Object.getPrototypeOf(output.bare)).toBeNull();
	});

	test("does not mutate its input", () => {
		const input = {
			date: "2026-09-01T10:30:00+00:00[UTC]",
			list: ["2026-09-01T10:30:00+00:00[UTC]"],
			nested: { date: "2026-09-01T10:30:00+00:00[UTC]" },
		};
		const snapshot = structuredClone(input);
		const output = stripDatetimeAnnotations(input);
		expect(input).toEqual(snapshot);
		expect(output).not.toBe(input);
		expect(output.list).not.toBe(input.list);
		expect(output.nested).not.toBe(input.nested);
	});

	test("returns non-plain values as is", () => {
		const date = new Date("2026-09-01T10:30:00Z");
		class Thing {
			value = "2026-09-01T10:30:00+00:00[UTC]";
		}
		const thing = new Thing();
		const apiObject = { __kind: "file" } as const;
		Object.setPrototypeOf(apiObject, { get: () => undefined });

		expect(stripDatetimeAnnotations(date)).toBe(date);
		expect(stripDatetimeAnnotations(thing)).toBe(thing);
		expect(thing.value).toBe("2026-09-01T10:30:00+00:00[UTC]");
		expect(stripDatetimeAnnotations(apiObject)).toBe(apiObject);
		expect(stripDatetimeAnnotations(5)).toBe(5);
		expect(stripDatetimeAnnotations(undefined)).toBeUndefined();
		expect(stripDatetimeAnnotations(null)).toBeNull();
		expect(stripDatetimeAnnotations({ date }).date).toBe(date);
	});
});
