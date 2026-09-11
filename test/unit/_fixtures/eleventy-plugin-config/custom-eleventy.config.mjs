// Custom config at a non-default filename, used by the configPath test.
// Registers a filter so the test can verify the mirror used this config.
import editableRegions from "@cloudcannon/editable-regions/eleventy";

/** @param {any} eleventyConfig */
export default function (eleventyConfig) {
	eleventyConfig.addFilter("customConfigFilter", (/** @type {any} */ s) => `custom:${s}`);

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
