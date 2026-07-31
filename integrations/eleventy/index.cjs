// Node can `require()` an ES module from v20.19 / v22.12 onward, so this stays
// a re-export. Older runtimes throw a bare ERR_REQUIRE_ESM naming neither this
// package nor a way out — translate it.

/** @type {any} */
let editableRegionsPlugin;

try {
	editableRegionsPlugin = require("./index.mjs").default;
} catch (err) {
	const code = /** @type {{ code?: string } | undefined} */ (err)?.code;
	if (code !== "ERR_REQUIRE_ESM") throw err;

	throw new Error(
		"@cloudcannon/editable-regions/eleventy is an ES module, and Node " +
			`${process.version} can't \`require()\` one (needs v20.19+ or v22.12+).` +
			"\n\nEither upgrade Node, or load the plugin with a dynamic import from " +
			"an async Eleventy config:\n\n" +
			"  module.exports = async function (eleventyConfig) {\n" +
			"    const { default: editableRegions } = await import(\n" +
			'      "@cloudcannon/editable-regions/eleventy"\n' +
			"    );\n" +
			"    eleventyConfig.addPlugin(editableRegions);\n" +
			"  };\n",
	);
}

module.exports = editableRegionsPlugin;
