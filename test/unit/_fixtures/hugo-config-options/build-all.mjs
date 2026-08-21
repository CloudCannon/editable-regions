/**
 * Builds the hugo-config-options fixture several times, each with a different
 * `[params.editable_regions]` scenario merged over the shared config.toml and
 * published to its own destination. The test file reads each built bundle.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const scenarios = [
	{ config: ["config.toml"], destination: "public/default" },
	{
		config: ["config.toml", "scenario-template-dirs.toml"],
		destination: "public/template-dirs",
	},
	{
		config: ["config.toml", "scenario-extensions.toml"],
		destination: "public/extensions",
	},
	{
		config: ["config.toml", "scenario-ignore-dirs.toml"],
		destination: "public/ignore-dirs",
	},
	{
		config: ["config.toml", "scenario-config-paths.toml"],
		destination: "public/config-paths",
	},
];

fs.rmSync(path.join(here, "public"), { recursive: true, force: true });
fs.rmSync(path.join(here, "resources"), { recursive: true, force: true });
fs.rmSync(path.join(here, ".hugo_build.lock"), { force: true });

for (const { config, destination } of scenarios) {
	console.log(`\n=== Building ${config.join(",")} -> ${destination} ===`);
	execSync(`hugo --config=${config.join(",")} --destination=${destination}`, {
		stdio: "inherit",
		cwd: here,
	});
}

console.log("\nAll hugo-config-options builds complete.");
