import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig, envField } from "astro/config";

// Minimal Astro fixture for unit tests. The live-editing entry is the only
// client bundle we care about, so its filename is pinned (no content hash)
// to let the vitest test file import a stable path.
// https://astro.build/config
export default defineConfig({
	site: "https://example.com",
	integrations: [editableRegions(), react(), svelte(), vue()],
	i18n: {
		defaultLocale: "en",
		locales: ["en", "es", "fr"],
	},
	env: {
		schema: {
			PUBLIC_SITE_NAME: envField.string({
				context: "client",
				access: "public",
				default: "Fixture Site",
			}),
			PUBLIC_MAX_ITEMS: envField.number({
				context: "client",
				access: "public",
				default: 10,
			}),
			SECRET_API_KEY: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
		},
	},
	vite: {
		build: {
			minify: false,
			rollupOptions: {
				output: {
					// Pin the live-editing chunk name (no content hash) so the vitest
					// test file can import a stable path. Other chunks keep hashes to
					// avoid collisions (e.g. Astro emits multiple `client` chunks).
					chunkFileNames: (chunk) =>
						chunk.name === "live-editing"
							? "_astro/live-editing.js"
							: "_astro/[name]-[hash].js",
					assetFileNames: "_astro/[name]-[hash][extname]",
				},
			},
		},
	},
});
