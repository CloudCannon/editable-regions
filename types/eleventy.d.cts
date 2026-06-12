/**
 * CommonJS declaration shape for `@cloudcannon/editable-regions/eleventy`.
 * Mirrors the ESM `.d.ts` but uses `export = ` so `require()` resolves to
 * the function directly. Shared interfaces are re-imported from the ESM
 * declarations to keep them in one place.
 */
import type {
	LiquidOptions,
	NormalizedPluginOptions,
	PluginOptions,
} from "./eleventy";

declare function editableRegions(
	eleventyConfig: any,
	pluginOptions: PluginOptions,
): void;
declare namespace editableRegions {
	export { LiquidOptions, NormalizedPluginOptions, PluginOptions };
}
export = editableRegions;
