import svelte from "@astrojs/svelte";
import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://example.com",
	integrations: [editableRegions(), svelte()],
	vite: {
		build: {
			minify: false,
			rollupOptions: {
				output: {
					chunkFileNames: (chunk) =>
						chunk.name === "live-editing"
							? "_astro/live-editing.js"
							: "_astro/[name]-[hash].js",
				},
			},
		},
	},
});
