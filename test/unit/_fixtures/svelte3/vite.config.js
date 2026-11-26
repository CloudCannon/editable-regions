import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	// Intentionally no svelte preprocessor: Svelte 3.47 cannot strip TypeScript.
	plugins: [svelte()],
	build: {
		// Use Vite 3's default target so syntax that older targets reject fails here.
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
