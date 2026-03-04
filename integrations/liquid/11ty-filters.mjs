/**
 * Browser-compatible implementations of Eleventy's built-in filters.
 * Some filters (get*CollectionItem, inputPathToUrl, renderTransforms) are not
 * included as they require build-time context.
 */

import slugify from "@sindresorhus/slugify";

/**
 * Logs value to console (pass-through filter).
 *
 * @param {any} value - Value to log
 * @param {string} [prefix] - Optional prefix for the log message
 * @returns {any} The original value (for chaining)
 */
export function logFilter(value, prefix = "") {
	if (prefix) {
		console.log(`[${prefix}]`, value);
	} else {
		console.log(value);
	}
	// Return the original value so it can be chained or used in output
	return value;
}

/**
 * Normalizes URL paths (simplified browser version of Eleventy's url filter).
 *
 * @param {string} url - URL to normalize
 * @param {string} [pathPrefix] - Optional path prefix to prepend
 * @returns {string} Normalized URL
 */
export function urlFilter(url, pathPrefix = "") {
	if (!url) {
		return "";
	}

	const urlString = String(url);

	// If there's a pathPrefix, prepend it
	if (pathPrefix) {
		// Ensure pathPrefix starts with / and doesn't end with /
		const normalizedPrefix = `/${pathPrefix.replace(/^\/+|\/+$/g, "")}`;

		// If url is absolute (starts with /), prepend pathPrefix
		if (urlString.startsWith("/")) {
			return normalizedPrefix + urlString;
		}
		// If url is relative, just return it
		return urlString;
	}

	// Basic normalization: ensure single slashes, remove trailing slash (except root)
	const normalized = urlString.replace(/\/+/g, "/");

	// Remove trailing slash unless it's the root path
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}

/** @type {Record<string, any>} */
export const eleventyFilters = {
	slugify,
	log: logFilter,
	url: urlFilter,
};
