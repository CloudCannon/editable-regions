import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const fixtureDir = path.resolve(
	import.meta.dirname,
	"../_fixtures/eleventy-plugin-config",
);

function readBundle(scenario: string): string {
	const bundlePath = path.join(
		fixtureDir,
		"_site",
		scenario,
		"register-components.js",
	);
	return fs.readFileSync(bundlePath, "utf8");
}

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

function getLiquidFileKeys(bundle: string): string[] {
	const matches = bundle.matchAll(/cc_liquid_files\["([^"]+)"\]/g);
	return [...matches].map((m) => m[1]);
}

test('extensions: [".liquid"] only inlines .liquid files, not .html', () => {
	const bundle = readBundle("extensions");

	const keys = getLiquidFileKeys(bundle);
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).not.toContain("src/_includes/html-file.html");
});

test("custom componentDirs only inlines files from the specified directories", () => {
	const bundle = readBundle("component-dirs");

	const keys = getLiquidFileKeys(bundle);
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).toContain("src/_includes/html-file.html");
	expect(keys).toContain("src/partials/sub-partial.liquid");
	expect(keys).not.toContain("src/index.liquid");
	expect(keys).not.toContain("src/ignored/ignored-file.liquid");
});

test("generated paths use forward slashes, never Windows separators", () => {
	// `path.join` yields "\" on Windows, which breaks generated imports and `cc_liquid_files` keys.
	const bundle = readBundle("component-dirs");

	expect(bundle).not.toMatch(/from "\.\/[^"]*\\/);
	for (const key of getLiquidFileKeys(bundle)) {
		expect(key).not.toContain("\\");
	}
});

test("ignoreDirectories skips files in the matching directories", () => {
	const bundle = readBundle("ignore-dirs");

	const keys = getLiquidFileKeys(bundle);
	expect(keys).not.toContain("src/ignored/ignored-file.liquid");
	expect(keys).toContain("src/_includes/liquid-file.liquid");
	expect(keys).toContain("src/index.liquid");
	expect(keys).toContain("src/partials/sub-partial.liquid");
});

test("custom output path writes the bundle to the specified location", () => {
	const customPath = path.join(fixtureDir, "dist", "custom-bundle.js");
	expect(fs.existsSync(customPath)).toBe(true);

	const bundle = fs.readFileSync(customPath, "utf8");
	expect(bundle).toContain("createSharedLiquidEngine");
});

test("custom configPath uses the specified config for the mirror", () => {
	const bundle = readBundle("config-path");

	expect(bundle).toContain("customConfigFilter");
});

test("liquid: false produces no bundle at all", () => {
	const bundle = readBundleOrNull("liquid-false");
	expect(bundle).toBeNull();
});
