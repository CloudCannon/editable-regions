/**
 * The Visual Editor API returns unquoted YAML datetimes with a bracketed
 * time-zone annotation that neither `Date` nor Hugo can parse, so we strip it.
 * Strip only data going into renderers, never data written back.
 *
 *   In the source file (unquoted)   From the API                        Stripped
 *   2026-09-01                      2026-09-01T00:00:00Z                (unchanged)
 *   2026-09-01T10:30:00Z            2026-09-01T10:30:00+00:00[UTC]      2026-09-01T10:30:00+00:00
 *   2026-09-01 10:30:00             2026-09-01T10:30:00+00:00[UTC]      2026-09-01T10:30:00+00:00
 *   2026-09-01T10:30:00+10:00       2026-09-01T10:30:00+10:00[+10:00]   2026-09-01T10:30:00+10:00
 *   "2026-09-01" (quoted)           2026-09-01                          (unchanged)
 *
 * The "From the API" format is RFC 9557: an RFC 3339 timestamp (the ISO 8601
 * profile `Date` parses) followed by `[...]` annotations, e.g. `[UTC]`,
 * `[!Europe/Paris]` or `[UTC][u-ca=iso8601]`.
 */
const ANNOTATED_DATETIME = new RegExp(
	[
		"^(", // capture the timestamp, which is kept
		"\\d{4}-\\d{2}-\\d{2}", // date: 2026-09-01
		"[Tt ]", // date/time separator
		"\\d{2}:\\d{2}", // hours and minutes: 10:30
		"(?::\\d{2}(?:\\.\\d+)?)?", // optional seconds and fraction: :00.123
		// Required offset (Z or ±hh:mm). Without one, stripping the annotation
		// would change the instant, so offset-less strings aren't matched.
		"(?:[Zz]|[+-]\\d{2}:\\d{2})",
		")",
		"(?:\\[[^[\\]]*\\])+$", // one or more [...] annotations, dropped
	].join(""),
);

/**
 * Removes the `[...]` annotations from a timestamp with an offset.
 * @param {string} value
 * @returns {string}
 */
export const stripDatetimeAnnotation = (value) => {
	if (typeof value !== "string" || !value.includes("[")) {
		return value;
	}
	const match = ANNOTATED_DATETIME.exec(value);
	return match ? match[1] : value;
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isPlainObject = (value) => {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * Deep-copies arrays and plain objects, stripping every datetime string.
 * Anything else (Dates, class instances, API objects) is returned as is.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const stripDatetimeAnnotations = (value) => {
	if (typeof value === "string") {
		return /** @type {T} */ (stripDatetimeAnnotation(value));
	}
	if (Array.isArray(value)) {
		return /** @type {T} */ (value.map(stripDatetimeAnnotations));
	}
	if (isPlainObject(value)) {
		/** @type {Record<string, unknown>} */
		const copy =
			Object.getPrototypeOf(value) === null ? Object.create(null) : {};
		for (const key of Object.keys(value)) {
			copy[key] = stripDatetimeAnnotations(value[key]);
		}
		return /** @type {T} */ (copy);
	}
	return value;
};
