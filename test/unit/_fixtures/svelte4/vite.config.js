import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [svelte({ preprocess: vitePreprocess() })],
	build: {
		target: "esnext",
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
