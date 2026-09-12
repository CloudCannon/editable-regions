import editableRegions from "@cloudcannon/editable-regions/eleventy";

/** @param {any} eleventyConfig */
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
