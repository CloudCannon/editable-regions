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
	const out = [];
	if (arr.length === 0) {
		return [`${prefix}: []`];
	}
	out.push(`${prefix}:`);
	for (const item of arr) {
		if (item && typeof item === "object" && !(item instanceof Date)) {
			if (Array.isArray(item)) {
				out.push(`${"  ".repeat(indent + 1)}-`);
				out.push(
					...yamlArrayEntry(`${"  ".repeat(indent + 2)}-`, item, indent + 2),
				);
			} else if (Object.keys(item).length === 0) {
				out.push(`${"  ".repeat(indent + 1)}- {}`);
			} else {
				const entries = Object.entries(item);
				const [firstKey, firstValue] = entries[0];
				out.push(
					...yamlLine(
						`${"  ".repeat(indent + 1)}- ${yamlKey(/** @type {string} */ (firstKey))}`,
						firstValue,
						indent + 1,
					),
				);
				for (const [key, value] of entries.slice(1)) {
					out.push(
						...yamlLine(
							`${"  ".repeat(indent + 2)}${yamlKey(key)}`,
							value,
							indent + 2,
						),
					);
				}
			}
		} else {
			out.push(`${"  ".repeat(indent + 1)}- ${yamlScalar(item)}`);
		}
	}
	return out;
}
