import { EleventyRenderPlugin } from "@11ty/eleventy";
import editableRegions from "@cloudcannon/editable-regions/eleventy";
import fs from "node:fs";
import echoTagFactory from "./overrides/echo-tag.mjs";

// Module-level closure. The helpers below close over it; because the plugin
// bundles the real config, the closure survives into the browser and those
// helpers auto-mirror as-is — no handwritten override needed. This is the
// fixture's closure-survival test case.
const buildInfo = { stamp: `fixture@${new Date().getTime()}` };

export default function (eleventyConfig) {
	// 11ty 3.x ships RenderPlugin but doesn't auto-load it. Adding here so
	// `renderTemplate`/`renderFile`/`renderContent` render server-side too.
	eleventyConfig.addPlugin(EleventyRenderPlugin);

	// Filter: auto-mirror (pure function, no closure).
	eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());

	// Filter: auto-mirror — closes over `buildInfo`, and the closure survives
	// bundling, so no override is required.
	eleventyConfig.addFilter("stamp", (s) => `${s} [${buildInfo.stamp}]`);

	// Shortcode: auto-mirror (pure function).
	eleventyConfig.addShortcode("year", () => new Date().getFullYear());

	// Shortcode: auto-mirror — closes over `buildInfo` (survives bundling).
	eleventyConfig.addShortcode("buildTime", () => buildInfo.stamp);

	// Paired shortcode: auto-mirror (pure function).
	eleventyConfig.addPairedShortcode(
		"highlight",
		(content, color = "yellow") =>
			`<mark style="background:${color}">${content}</mark>`,
	);

	// Paired shortcode: auto-mirror — closes over `buildInfo` (survives bundling).
	eleventyConfig.addPairedShortcode(
		"box",
		(content) =>
			`<div class="box" data-stamp="${buildInfo.stamp}">${content}</div>`,
	);

	// Custom Liquid tag — auto-mirrors too: the factory module is bundled, so
	// the same `{% echo %}` tag is available browser-side with no override.
	eleventyConfig.addLiquidTag("echo", echoTagFactory);

	// Async helpers — exercise the async registration methods 11ty exposes
	// (`addAsyncFilter` / `addAsyncShortcode` / `addPairedAsyncShortcode`).
	// These mirror the same way the sync variants do; the point is to confirm
	// the async method names are recognised and the helpers render in the
	// browser (visible on the filters / shortcodes pages in the editor).
	eleventyConfig.addAsyncFilter("asyncReverse", async (s) =>
		String(s).split("").reverse().join(""),
	);
	eleventyConfig.addAsyncShortcode(
		"asyncGreeting",
		async () => "hi from an async shortcode",
	);
	eleventyConfig.addPairedAsyncShortcode(
		"asyncWrap",
		async (content) => `<aside class="async-wrap">${content}</aside>`,
	);

	// Filter: genuinely non-portable — reads a file from disk at render time,
	// which can't run in the browser. The bundle stub makes `fs.readFileSync`
	// throw if called, so this one keeps a browser override
	// (`liquid.filters.readmeSize` below).
	eleventyConfig.addFilter("readmeSize", () => fs.statSync("README.md").size);

	// Date filters commonly used in 11ty projects. The browser bundle has
	// handwritten ports for these names, and the auto-mirror skips them by
	// name to protect those ports — so registering here only affects the
	// server-side render.
	eleventyConfig.addFilter("dateToRfc3339", (d) =>
		new Date(d).toISOString(),
	);
	eleventyConfig.addFilter("dateToRfc822", (d) =>
		new Date(d).toUTCString(),
	);
	eleventyConfig.addFilter("htmlDateString", (d) =>
		new Date(d).toISOString().slice(0, 10),
	);
	eleventyConfig.addFilter("getNewestCollectionItemDate", (collection) => {
		if (!Array.isArray(collection) || collection.length === 0)
			return new Date(0);
		return collection.reduce((newest, item) => {
			const d = new Date(item?.date ?? 0);
			return d > newest ? d : newest;
		}, new Date(0));
	});

	// 11ty doesn't expose `process.env` to templates, so surface selected env
	// vars the normal way: a global data value the build renders server-side,
	// mirrored into live editing via `globals` below so the editor agrees.
	const env = {
		NODE_ENV: process.env.NODE_ENV,
		PUBLIC_SITE_NAME: process.env.PUBLIC_SITE_NAME,
		PUBLIC_API_BASE: process.env.PUBLIC_API_BASE,
	};
	eleventyConfig.addGlobalData("env", env);

	eleventyConfig.addPlugin(editableRegions, {
		verbose: true,
		liquid: {
			extensions: [".liquid"],
			// Replace `_includes/card.liquid` for editor-time renders only.
			components: {
				card: "./overrides/card-override.mjs",
			},
			// Browser override for the one genuinely non-portable filter above.
			filters: {
				readmeSize: "./overrides/readme-size-filter.mjs",
			},
		},
		// Mirror the `env` global data into live editing.
		globals: { env },
	});

	return {
		dir: {
			input: "src",
			includes: "_includes",
			output: "_site",
		},
		markdownTemplateEngine: "liquid",
		htmlTemplateEngine: "liquid",
	};
}
