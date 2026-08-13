// Minimal YAML serializer for editor content stubs. The runtime writes each
// content file's front matter (fetched from the CloudCannon API) as YAML so
// Hugo's front-matter decoder — goccy/go-yaml — produces typed params:
// whole numbers parse as uint64 (printf "%d" works, big ids don't print in
// scientific notation), dates stay quoted strings, keys keep their exact case.
// JSON stubs would decode every number as float64 (see params-coercion.test.ts
// for the same problem on props).
//
// Deliberately conservative: every string (and any key that could be
// ambiguous) is double-quoted, and only the shapes the API returns — plain
// objects, arrays, numbers, booleans, strings, null, Date — are emitted.

/**
 * Serializes front matter to YAML, wrapped in `---` delimiters.
 * @param {Record<string, any>} data
 * @returns {string}
 */
export function serializeFrontMatter(data) {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new TypeError("front matter must be a plain object");
	}
	if (Object.keys(data).length === 0) {
		return "---\n{}\n---\n";
	}
	return `---\n${yamlObject(data, 0, []).join("\n")}\n---\n`;
}

/**
 * Serializes a data file's contents to a bare YAML document (no front-matter
 * delimiters), for dataset files mirrored from the CloudCannon API into the
 * editor site's data dir. Object and array roots are supported; scalars pass
 * through (Hugo rejects scalar-root data files natively too, so the mirror
 * behaves like the real build).
 * @param {Record<string, any> | any[] | any} data
 * @returns {string}
 */
export function serializeData(data) {
	if (Array.isArray(data)) {
		if (data.length === 0) return "[]\n";
		return `${yamlArrayItems(data, 0, []).join("\n")}\n`;
	}
	if (data && typeof data === "object" && !(data instanceof Date)) {
		if (Object.keys(data).length === 0) return "{}\n";
		return `${yamlObject(data, 0, []).join("\n")}\n`;
	}
	return `${yamlScalar(data)}\n`;
}

/**
 * Quotes a map key when it could be parsed as something else or contains
 * characters outside YAML's safe key set.
 * @param {string} key
 * @returns {string}
 */
function yamlKey(key) {
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/**
 * @param {any} value
 * @returns {string}
 */
function yamlScalar(value) {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (Number.isNaN(value) || !Number.isFinite(value)) {
			// YAML has no NaN/Infinity; pass them through as quoted strings.
			return JSON.stringify(String(value));
		}
		return String(value);
	}
	if (value instanceof Date) {
		return JSON.stringify(value.toISOString());
	}
	return JSON.stringify(String(value));
}

/**
 * Appends the YAML lines for a plain object at `indent`. Returns `out`.
 * @param {Record<string, any>} obj
 * @param {number} indent
 * @param {string[]} out
 * @returns {string[]}
 */
function yamlObject(obj, indent, out) {
	const pad = "  ".repeat(indent);
	for (const [key, value] of Object.entries(obj)) {
		out.push(...yamlLine(`${pad}${yamlKey(key)}`, value, indent));
	}
	return out;
}

/**
 * Returns the line(s) for `prefix: value`; arrays and maps push their
 * contents at `indent + 1`, scalars go inline.
 * @param {string} prefix
 * @param {any} value
 * @param {number} indent
 * @returns {string[]}
 */
function yamlLine(prefix, value, indent) {
	if (value && typeof value === "object" && !(value instanceof Date)) {
		if (Array.isArray(value)) {
			return yamlArrayEntry(prefix, value, indent);
		}
		if (Object.keys(value).length === 0) {
			return [`${prefix}: {}`];
		}
		return [`${prefix}:`, ...yamlObject(value, indent + 1, [])];
	}
	return [`${prefix}: ${yamlScalar(value)}`];
}

/**
 * Returns the lines for a block sequence at `prefix:`; map items put their
 * first key on the dash line and subsequent keys on the next line at the
 * same column.
 * @param {string} prefix
 * @param {any[]} arr
 * @param {number} indent
 * @returns {string[]}
 */
function yamlArrayEntry(prefix, arr, indent) {
	if (arr.length === 0) {
		return [`${prefix}: []`];
	}
	return [`${prefix}:`, ...yamlArrayItems(arr, indent + 1, [])];
}

/**
 * Emits the `- item` lines of a block sequence, each at `indent`. Used both
 * for sequences nested under a key (via yamlArrayEntry) and for array-root
 * data documents (via serializeData).
 * @param {any[]} arr
 * @param {number} indent
 * @param {string[]} out
 * @returns {string[]}
 */
function yamlArrayItems(arr, indent, out) {
	for (const item of arr) {
		if (item && typeof item === "object" && !(item instanceof Date)) {
			if (Array.isArray(item)) {
				// Nested sequence: the dash stands alone and sub-items align
				// one level deeper.
				out.push(`${"  ".repeat(indent)}-`);
				out.push(...yamlArrayItems(item, indent + 1, []));
			} else if (Object.keys(item).length === 0) {
				out.push(`${"  ".repeat(indent)}- {}`);
			} else {
				const entries = Object.entries(item);
				const [firstKey, firstValue] = entries[0];
				out.push(
					...yamlLine(
						`${"  ".repeat(indent)}- ${yamlKey(/** @type {string} */ (firstKey))}`,
						firstValue,
						indent,
					),
				);
				for (const [key, value] of entries.slice(1)) {
					out.push(
						...yamlLine(
							`${"  ".repeat(indent + 1)}${yamlKey(key)}`,
							value,
							indent + 1,
						),
					);
				}
			}
		} else {
			out.push(`${"  ".repeat(indent)}- ${yamlScalar(item)}`);
		}
	}
	return out;
}
