import fs from "node:fs";
import { EleventyRenderPlugin } from "@11ty/eleventy";
import editableRegions from "@cloudcannon/editable-regions/eleventy";
import echoTagFactory from "./overrides/echo-tag.mjs";
import repeatTagFactory from "./overrides/repeat-tag.mjs";

// Module-level closure. Helpers that close over this object auto-mirror
// with no override because the real config is bundled.
const buildInfo = { stamp: `fixture@${Date.now()}` };

export default function (eleventyConfig) {
	eleventyConfig.addPlugin(EleventyRenderPlugin);

	// --- Filters ---

	// Auto-mirror: plain pure function.
	eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());

	// Auto-mirror: closes over buildInfo (closure survives bundling).
	eleventyConfig.addFilter("stamp", (s) => `${s} [${buildInfo.stamp}]`);

	// Auto-mirror: async filter (addAsyncFilter).
	eleventyConfig.addAsyncFilter("asyncReverse", async (s) =>
		String(s).split("").reverse().join(""),
	);

	// Non-portable: reads file size from disk at render time.
	// Browser override replaces it.
	eleventyConfig.addFilter("readmeSize", () => fs.statSync("README.md").size);

	// Layer precedence: register the same name as both universal and
	// Liquid-specific. The Liquid layer should win.
	eleventyConfig.addFilter("doubler", (n) => `universal:${n * 2}`);
	eleventyConfig.addLiquidFilter("doubler", (n) => `liquid:${n * 2}`);

	// Builtin name collision: registering a filter named "slug" — the
	// builtin browser port should win (config version is skipped).
	eleventyConfig.addFilter("slug", (s) => `config-slug:${s}`);

	// --- Shortcodes ---

	// Auto-mirror: plain pure function.
	eleventyConfig.addShortcode("year", () => new Date().getFullYear());

	// Auto-mirror: closes over buildInfo.
	eleventyConfig.addShortcode("buildTime", () => buildInfo.stamp);

	// Auto-mirror: async shortcode.
	eleventyConfig.addAsyncShortcode(
		"asyncGreeting",
		async () => "hi from an async shortcode",
	);

	// Non-portable shortcode: reads from disk. Browser override replaces it.
	eleventyConfig.addShortcode("diskSize", () => fs.statSync("README.md").size);

	// --- Paired shortcodes ---

	// Auto-mirror: plain paired shortcode.
	eleventyConfig.addPairedShortcode(
		"highlight",
		(content, color = "yellow") =>
			`<mark style="background:${color}">${content}</mark>`,
	);

	// Auto-mirror: paired shortcode closing over buildInfo.
	eleventyConfig.addPairedShortcode(
		"box",
		(content) =>
			`<div class="box" data-stamp="${buildInfo.stamp}">${content}</div>`,
	);

	// Auto-mirror: async paired shortcode.
	eleventyConfig.addPairedAsyncShortcode(
		"asyncWrap",
		async (content) => `<aside class="async-wrap">${content}</aside>`,
	);

	// Non-portable paired shortcode: reads from disk. Browser override.
	eleventyConfig.addPairedShortcode(
		"diskWrap",
		(content) =>
			`<div data-size="${fs.statSync("README.md").size}">${content}</div>`,
	);

	// Layer precedence: same name as universal + Liquid-specific.
	eleventyConfig.addShortcode("sizer", () => "universal-sizer");
	eleventyConfig.addLiquidShortcode("sizer", () => "liquid-sizer");

	// --- Custom tags ---

	// Auto-mirrored custom Liquid tag.
	eleventyConfig.addLiquidTag("echo", echoTagFactory);

	// Non-portable custom tag: reads from disk. Browser override.
	eleventyConfig.addLiquidTag("diskTag", repeatTagFactory);

	// --- Global data mirrored via globals option ---

	const env = {
		NODE_ENV: "test",
		PUBLIC_SITE_NAME: "fixture",
		PUBLIC_API_BASE: "https://example.test",
	};
	eleventyConfig.addGlobalData("env", env);

	eleventyConfig.addPlugin(editableRegions, {
		liquid: {
			extensions: [".liquid"],
			components: {
				card: "./overrides/card-override.mjs",
			},
			filters: {
				readmeSize: "./overrides/readme-size-filter.mjs",
			},
			shortcodes: {
				diskSize: "./overrides/disk-size-shortcode.mjs",
			},
			pairedShortcodes: {
				diskWrap: "./overrides/disk-wrap-paired.mjs",
			},
			tags: {
				diskTag: "./overrides/disk-tag-override.mjs",
			},
		},
		globals: { env },
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site",
		},
	};
}
