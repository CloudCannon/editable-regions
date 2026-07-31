// A Node-only 11ty plugin shipped as a factory, e.g.
// `addPlugin(pluginBookshop({ … }))`. `readdirSync` runs at factory-call
// time — during the config replay, in the browser mirror.
const fs = require("node:fs");

module.exports = function fakeNodePlugin(options = {}) {
	const entries = fs.readdirSync(options.dir ?? ".");

	return function (eleventyConfig) {
		eleventyConfig.addFilter("fixtureFileCount", () => entries.length);
	};
};
