/**
 * Builds the plugin-config fixture multiple times with different Eleventy
 * config files and output directories. Each config exercises a different
 * `pluginOptions` combination. The test file imports each built bundle.
 */
import { execSync } from "node:child_process";

const configs = [
	{ config: "config-extensions.mjs", output: "_site/extensions" },
	{ config: "config-component-dirs.mjs", output: "_site/component-dirs" },
	{ config: "config-ignore-dirs.mjs", output: "_site/ignore-dirs" },
	{ config: "config-output.mjs", output: "_site/output" },
	{ config: "config-config-path.mjs", output: "_site/config-path" },
	{ config: "config-liquid-false.mjs", output: "_site/liquid-false" },
];

for (const { config, output } of configs) {
	console.log(`\n=== Building with ${config} → ${output} ===`);
	execSync(`npx eleventy --config=${config} --output=${output}`, {
		stdio: "inherit",
		cwd: import.meta.dirname,
	});
}

console.log("\nAll plugin-config builds complete.");
