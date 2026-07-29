import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions, {
		liquid: {
			componentDirs: ["src/_includes", "src/partials"],
		},
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site/component-dirs",
		},
	};
}
