import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue2";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [vue()],
	resolve: {
		// The package is linked with `file:`, so resolve Vue from the fixture
		// instead of the repository's own Vue 3 install.
		alias: [
			{
				find: /^vue$/,
				replacement: path.resolve(
					root,
					"node_modules/vue/dist/vue.runtime.esm.js",
				),
			},
		],
	},
	build: {
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
