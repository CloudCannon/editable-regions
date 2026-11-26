const editableRegions = require("@cloudcannon/editable-regions/eleventy");

module.exports = function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions);

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site",
		},
	};
};
