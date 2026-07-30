import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	eleventyConfig.addFilter("customConfigFilter", (s) => `custom:${s}`);

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
