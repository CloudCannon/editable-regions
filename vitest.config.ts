import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { build } from "esbuild";

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		conditions: ["browser"],
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./test/unit/setup.ts"],
		include: ["test/unit/**/*.test.{mjs,ts}"],
	},
});
