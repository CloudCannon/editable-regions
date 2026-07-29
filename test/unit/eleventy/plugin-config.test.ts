import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const fixtureDir = path.resolve(
	import.meta.dirname,
	"../_fixtures/eleventy-plugin-config",
);

/** Reads a built bundle file. Asserts the file exists. */
function readBundle(scenario: string): string {
	const bundlePath = path.join(
		fixtureDir,
		"_site",
		scenario,
		"register-components.js",
	);
	return fs.readFileSync(bundlePath, "utf8");
}

/** Reads a built bundle, or returns null if it doesn't exist. */
function readBundleOrNull(scenario: string): string | null {
	const bundlePath = path.join(
		fixtureDir,
		"_site",
		scenario,
		"register-components.js",
	);
	if (!fs.existsSync(bundlePath)) return null;
	return fs.readFileSync(bundlePath, "utf8");
}

/** Extracts the `window.cc_liquid_files` keys from a bundle. */
function getLiquidFileKeys(bundle: string): string[] {
	const matches = bundle.matchAll(/cc_liquid_files\["([^"]+)"\]/g);
	return [...matches].map((m) => m[1]);
}

// --- extensions ---

test('extensions: [".liquid"] only inlines .liquid files, not .html', () => {
	const bundle = readBundle("extensions");

	const keys = getLiquidFileKeys(bundle);
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).not.toContain("src/_includes/html-file.html");
});

// --- componentDirs ---

test("custom componentDirs only inlines files from the specified directories", () => {
	const bundle = readBundle("component-dirs");

	const keys = getLiquidFileKeys(bundle);
	// componentDirs: ["src/_includes", "src/partials"]
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).toContain("src/_includes/html-file.html");
	expect(keys).toContain("src/partials/sub-partial.liquid");
	// src/ is not in componentDirs
	expect(keys).not.toContain("src/index.liquid");
	expect(keys).not.toContain("src/ignored/ignored-file.liquid");
});

// --- ignoreDirectories ---

test("ignoreDirectories skips files in the matching directories", () => {
	const bundle = readBundle("ignore-dirs");

	const keys = getLiquidFileKeys(bundle);
	// ignoreDirectories: ["_site", "node_modules", "ignored"]
	expect(keys).not.toContain("src/ignored/ignored-file.liquid");
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).toContain("src/index.liquid");
	expect(keys).toContain("src/partials/sub-partial.liquid");
});

// --- output ---

test("custom output path writes the bundle to the specified location", () => {
	// config-output.mjs sets output: "dist/custom-bundle.js"
	const customPath = path.join(fixtureDir, "dist", "custom-bundle.js");
	expect(fs.existsSync(customPath)).toBe(true);

	const bundle = fs.readFileSync(customPath, "utf8");
	expect(bundle).toContain("createSharedLiquidEngine");
});

// --- configPath ---

test("custom configPath uses the specified config for the mirror", () => {
	const bundle = readBundle("config-path");

	// The custom config registers a filter "customConfigFilter".
	expect(bundle).toContain("customConfigFilter");
});

// --- liquid: false ---

test("liquid: false produces no bundle at all", () => {
	const bundle = readBundleOrNull("liquid-false");
	expect(bundle).toBeNull();
});
