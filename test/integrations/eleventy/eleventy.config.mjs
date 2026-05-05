import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function (eleventyConfig) {
	// Tier 2 sanity: a user-registered portable filter should auto-mirror into
	// the browser engine without any further configuration.
	eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());

	// Tier 2 sanity: a filter that references Eleventy's `this.ctx` should be
	// classified as unportable and emitted as a warn-once stub.
	eleventyConfig.addFilter("currentPageUrl", function () {
		return this.ctx.page.url;
	});

	eleventyConfig.addPlugin(editableRegions, {
		verbose: true,
		liquid: {
			extensions: [".liquid"],
		},
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site",
		},
		markdownTemplateEngine: "liquid",
		htmlTemplateEngine: "liquid",
	};
}
