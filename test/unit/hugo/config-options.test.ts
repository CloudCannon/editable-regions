/** Reads scenario bundles built by _fixtures/hugo-config-options/build-all.mjs. */

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const fixtureDir = path.resolve(
	import.meta.dirname,
	"../_fixtures/hugo-config-options",
);

function readBundle(scenario: string): string {
	const assetDir = path.join(fixtureDir, "public", scenario, "_cloudcannon");
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

function snapshotHas(bundle: string, key: string): boolean {
	// Keys contain slashes/dots, so an exact quoted match against the jsonify'd snapshot is reliable.
	return bundle.includes(JSON.stringify(key));
}

test("template_dirs replaces the walk and captures only the listed dirs", () => {
	const bundle = readBundle("template-dirs");

	expect(snapshotHas(bundle, "extra-templates/custom-partial.html")).toBe(true);

	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(false);
});

test("template_dirs still leaves config discovery intact", () => {
	const bundle = readBundle("template-dirs");

	expect(snapshotHas(bundle, "config.toml")).toBe(true);
});

test("template_extensions restricts capture to the listed extensions", () => {
	const bundle = readBundle("extensions");

	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.gohtml")).toBe(
		true,
	);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.htm")).toBe(false);
});

test("ignore_directories skips matching directory names", () => {
	const bundle = readBundle("ignore-dirs");

	expect(snapshotHas(bundle, "layouts/partials/skipme/inside.html")).toBe(
		false,
	);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});

test("default ignore list prunes build-noise directories during the walk", () => {
	const bundle = readBundle("default");

	expect(snapshotHas(bundle, "layouts/partials/resources/inner.html")).toBe(
		false,
	);
	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});

test("config_paths replaces config discovery and captures only the listed files", () => {
	const bundle = readBundle("config-paths");

	expect(snapshotHas(bundle, "site-config.toml")).toBe(true);

	expect(snapshotHas(bundle, "config.toml")).toBe(false);
});

test("config_paths leaves template discovery intact", () => {
	const bundle = readBundle("config-paths");

	expect(snapshotHas(bundle, "layouts/partials/proj-partial.html")).toBe(true);
});

test("config_dirs replaces config discovery and walks the dir recursively", () => {
	const bundle = readBundle("additional");

	expect(snapshotHas(bundle, "config.toml")).toBe(false);
	expect(snapshotHas(bundle, "extra-config/settings.toml")).toBe(true);
	expect(snapshotHas(bundle, "extra-config/nested/deep.yaml")).toBe(true);
});

test("additional_paths and additional_dirs capture extra files verbatim", () => {
	const bundle = readBundle("additional");

	expect(snapshotHas(bundle, "additional/notes.md")).toBe(true);
	expect(snapshotHas(bundle, "additional/text/a.txt")).toBe(true);
	expect(snapshotHas(bundle, "additional/text/b.txt")).toBe(true);
	expect(snapshotHas(bundle, "additional/text/c.md")).toBe(false);
});
