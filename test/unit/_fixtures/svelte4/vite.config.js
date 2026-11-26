import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	// Intentionally no svelte preprocessor: the published EditableRegions.svelte
	// must compile as plain JavaScript on Svelte 3.47+ and 4.
	plugins: [svelte()],
	build: {
		// Use Vite's default target so syntax that older targets reject, such as
		// top-level await, fails here as it would in a SvelteKit site.
		minify: false,
		rollupOptions: {
			input: "src/live-editing.js",
			output: {
				format: "es",
				entryFileNames: "live-editing.js",
				inlineDynamicImports: true,
			},
		},
	},
});
