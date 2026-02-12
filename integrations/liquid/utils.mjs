/**
 * Slugifies a string value.
 *
 * @param {any} value - Value to slugify
 * @returns {string} Slugified string
 */
export function slugifyFilter(value) {
	return String(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // Strip diacritics (é→e, ñ→n, etc.)
		.replace(/[*+~.()'"!:@]/g, "") // Remove specific characters
		.replace(/\s+/g, "-") // Replace spaces with dashes
		.replace(/[^a-zA-Z0-9_-]/g, "") // Remove non-alphanumeric (keep dash, underscore)
		.replace(/-+/g, "-") // Replace multiple dashes with single dash
		.replace(/^-|-$/g, "") // Trim dashes from edges
		.toLowerCase(); // Convert to lowercase
}
