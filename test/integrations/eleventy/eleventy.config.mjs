import { EleventyRenderPlugin } from "@11ty/eleventy";
import editableRegions from "@cloudcannon/editable-regions/eleventy";
import echoTagFactory from "./overrides/echo-tag.mjs";

// Module-level closure — not serialisable into the browser bundle.
// Used by the three override-path registrations below.
const buildInfo = { stamp: `fixture@${new Date().getTime()}` };

export default function (eleventyConfig) {
	// 11ty 3.x ships RenderPlugin but doesn't auto-load it. Adding here so
	// `renderTemplate`/`renderFile`/`renderContent` render server-side too.
	eleventyConfig.addPlugin(EleventyRenderPlugin);

	// Filter: auto-mirror (pure function, no closure).
	eleventyConfig.addFilter("shout", (s) => String(s).toUpperCase());

	// Filter: browser override (closes over buildInfo — not serialisable).
	eleventyConfig.addFilter("stamp", (s) => `${s} [${buildInfo.stamp}]`);

	// Shortcode: auto-mirror (pure function).
	eleventyConfig.addShortcode("year", () => new Date().getFullYear());

	// Shortcode: browser override (closes over buildInfo — not serialisable).
	eleventyConfig.addShortcode("buildTime", () => buildInfo.stamp);

	// Paired shortcode: auto-mirror (pure function).
	eleventyConfig.addPairedShortcode(
		"highlight",
		(content, color = "yellow") =>
			`<mark style="background:${color}">${content}</mark>`,
	);

	// Paired shortcode: browser override (closes over buildInfo — not serialisable).
	eleventyConfig.addPairedShortcode(
		"box",
		(content) =>
			`<div class="box" data-stamp="${buildInfo.stamp}">${content}</div>`,
	);

	// Custom Liquid tag — server-side registration. The browser bundle gets
	// the same factory via `pluginOptions.liquid.tags` below.
	eleventyConfig.addLiquidTag("echo", echoTagFactory);

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

	eleventyConfig.addPlugin(editableRegions, {
		verbose: true,
		liquid: {
			extensions: [".liquid"],
			// Custom tags are never auto-mirrored — register the browser-side
			// factory explicitly.
			tags: {
				echo: "./overrides/echo-tag.mjs",
			},
			// Replace `_includes/card.liquid` for editor-time renders only.
			components: {
				card: "./overrides/card-override.mjs",
			},
			// Browser overrides for the three non-portable registrations above.
			filters: {
				stamp: "./overrides/stamp-filter.mjs",
			},
			shortcodes: {
				buildTime: "./overrides/buildtime-shortcode.mjs",
			},
			pairedShortcodes: {
				box: "./overrides/box-shortcode.mjs",
			},
		},
		env: ["NODE_ENV"],
		envPrefix: "PUBLIC_",
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
