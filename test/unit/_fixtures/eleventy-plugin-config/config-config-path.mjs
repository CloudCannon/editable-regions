import editableRegions from "@cloudcannon/editable-regions/eleventy";

/** @param {any} eleventyConfig */
export default function (eleventyConfig) {
	eleventyConfig.addFilter(
		"customConfigFilter",
		(/** @type {any} */ s) => `custom:${s}`,
	);

	eleventyConfig.addPlugin(editableRegions, {
		liquid: {
			configPath: "./custom-eleventy.config.mjs",
		},
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site/config-path",
		},
	};
}
