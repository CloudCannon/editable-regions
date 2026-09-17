// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-09-16",
	devtools: { enabled: false },

	// Every harness page is linked from the index, so crawling from "/" is
	// enough to prerender the whole site to static HTML.
	nitro: {
		minify: false,
		// Nitro's prerender caches write via tmp-file + rename, which throws
		// EPERM on Windows when a key is written twice. They only need to
		// live for this build, so keep them in memory instead of on disk.
		storage: {
			"internal:nuxt:prerender": { driver: "memory" },
		},
		prerender: {
			crawlLinks: true,
			routes: ["/"],
		},
	},

	vue: {
		compilerOptions: {
			// CloudCannon's <editable-text>, <editable-image>, <editable-component>,
			// <editable-array>, <editable-array-item> and <editable-source> custom
			// elements self-hydrate in the Visual Editor. Without this hook Vue tries
			// to resolve them as components and warns on every render.
			isCustomElement: (tag: string) => tag.startsWith("editable-"),
		},
	},

	css: ["~/assets/site.css"],

	sourcemap: true,
	vite: {
		build: {
			minify: false,
		},
	},
});
