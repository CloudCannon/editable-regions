import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions, {
		liquid: {
			ignoreDirectories: ["_site", "node_modules", "ignored"],
		},
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site/ignore-dirs",
		},
	};
}
