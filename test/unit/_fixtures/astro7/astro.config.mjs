import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://example.com",
	integrations: [editableRegions()],
	vite: {
		environments: {
			client: {
				build: {
					minify: false,
					rolldownOptions: {
						output: {
							// Astro 7/Rolldown uses the client environment's options.
							chunkFileNames: (chunk) =>
								chunk.name === "live-editing"
									? "_astro/live-editing.js"
									: "_astro/[name]-[hash].js",
						},
					},
				},
			},
		},
	},
});
