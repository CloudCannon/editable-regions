/**
 * Bundles the browser runtime into the Hugo module's static directory as a
 * single IIFE, so sites consuming the module need no Node toolchain at all.
 * Run alongside `renderer/build.sh` when cutting a release:
 *
 *   node integrations/hugo/build-runtime.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));

const result = await esbuild.build({
	entryPoints: [path.join(here, "browser/runtime-entry.mjs")],
	bundle: true,
	format: "iife",
	platform: "browser",
	minify: true,
	metafile: true,
	outfile: path.join(here, "hugo-module/static/cc-editable-regions/runtime.js"),
});

const [outfile] = Object.entries(result.metafile.outputs);
console.log(`Built ${outfile[0]} (${(outfile[1].bytes / 1024).toFixed(1)}kb)`);
