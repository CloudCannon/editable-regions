import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Fully static output (build/) — every route prerenders (+layout.js).
		// adapter-auto produces no deployable output without a detected platform.
		adapter: adapter(),
	},
};

export default config;
