// Older runtimes throw a bare ERR_REQUIRE_ESM naming neither this package nor a way out.
import type { default as EditableRegionsPlugin } from "./index.js";

// `export =` makes the CJS declaration expose the default export with its real type.
let editableRegionsPlugin: typeof EditableRegionsPlugin | undefined;

try {
	editableRegionsPlugin = require("./index.js").default;
} catch (err) {
	const code = (err as { code?: string } | undefined)?.code;
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

export = editableRegionsPlugin as typeof EditableRegionsPlugin;
