import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	eleventyConfig.addPlugin(editableRegions, {
		liquid: {
			extensions: [".liquid"],
		},
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site/extensions",
		},
	};
}
