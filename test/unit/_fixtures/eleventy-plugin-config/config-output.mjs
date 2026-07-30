import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions, {
		output: "dist/custom-bundle.js",
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site/output",
		},
	};
}
