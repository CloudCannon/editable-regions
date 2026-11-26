const editableRegions = require("@cloudcannon/editable-regions/eleventy");

module.exports = function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions);
	eleventyConfig.addLiquidFilter("shout", (value) =>
		String(value).toUpperCase(),
	);

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site",
		},
	};
};
