/**
 * Configuration-option tests for the Hugo integration. Each scenario builds the
 * same fixture site with a different `params.editable_regions` combination
 * (see `_fixtures/hugo-config-options/build-all.mjs`); the tests read the built
 * bundle text and assert which physical paths landed in the template/config
 * snapshot (`window.cc_hugo_files`).
 */

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const fixtureDir = path.resolve(
	import.meta.dirname,
	"../_fixtures/hugo-config-options",
);

/** Reads the built, fingerprinted live-editing bundle for a scenario. */
function readBundle(scenario: string): string {
	const assetDir = path.join(
		fixtureDir,
		"public",
		scenario,
		"cc-editable-regions",
	);
	const file = fs
		.readdirSync(assetDir)
		.find((name) => /^live-editing\..+\.js$/.test(name));

	if (!file) {
		throw new Error(
			`No live-editing bundle in ${assetDir} — run ` +
				"`npm run test:build-hugo-config-options` first.",
		);
	}

	return fs.readFileSync(path.join(assetDir, file), "utf8");
}

/** Whether the snapshot embeds the given physical-path key. */
function snapshotHas(bundle: string, key: string): boolean {
	// The snapshot is jsonified onto `window.cc_hugo_files`; keys are quoted
	// string literals (and contain slashes/dots, so minification can't strip
	// the quotes), so an exact quoted match is reliable.
	return bundle.includes(JSON.stringify(key));
}

// --- template_dirs ---------------------------------------------------------

test("template_dirs replaces the walk and captures only the listed dirs", () => {
	const bundle = readBundle("template-dirs");

	expect(snapshotHas(bundle, "extra-templates/custom-partial.html")).toBe(true);

	// The auto-discovery walk (partials, shortcodes, _default/_markup) was
	// replaced, so nothing under layouts/ is captured.
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(false);
});

test("template_dirs still leaves config discovery intact", () => {
	const bundle = readBundle("template-dirs");

	// config_paths isn't set, so the root config is still captured as usual.
	expect(snapshotHas(bundle, "config.toml")).toBe(true);
});

// --- template_extensions ---------------------------------------------------

test("template_extensions restricts capture to the listed extensions", () => {
	const bundle = readBundle("extensions");

	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.gohtml")).toBe(
		true,
	);
	// .htm is not in template_extensions = [".html", ".gohtml"].
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.htm")).toBe(false);
});

// --- ignore_directories ----------------------------------------------------

test("ignore_directories skips matching directory names", () => {
	const bundle = readBundle("ignore-dirs");

	// ignore_directories = ["skipme"] hides everything under that directory.
	expect(snapshotHas(bundle, "layouts/partials/skipme/inside.html")).toBe(
		false,
	);
	// Unignored siblings are still captured.
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});

test("default ignore list prunes build-noise directories during the walk", () => {
	// No ignore_directories configured, so the default list (.git,
	// node_modules, public, resources) applies — including inside walked trees
	// via find-files-with-extension.
	const bundle = readBundle("default");

	expect(snapshotHas(bundle, "layouts/partials/resources/inner.html")).toBe(
		false,
	);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});

// --- config_paths ----------------------------------------------------------

test("config_paths replaces config discovery and captures only the listed files", () => {
	const bundle = readBundle("config-paths");

	expect(snapshotHas(bundle, "site-config.toml")).toBe(true);

	// The default config discovery (root config.toml) was replaced.
	expect(snapshotHas(bundle, "config.toml")).toBe(false);
});

test("config_paths leaves template discovery intact", () => {
	const bundle = readBundle("config-paths");

	// template_dirs isn't set, so templates are still auto-discovered.
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});
