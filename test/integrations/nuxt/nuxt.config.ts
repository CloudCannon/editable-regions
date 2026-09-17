// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-09-16",
	devtools: { enabled: false },

	// Every harness page is linked from the index, so crawling from "/" is
	// enough to prerender the whole site to static HTML.
	nitro: {
		minify: false,
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
