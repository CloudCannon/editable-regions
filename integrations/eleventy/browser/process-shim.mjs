/**
 * Stand-ins for the Node globals a config reaches for without importing
 * anything, so there's no module to stub — `process.env.X` at the top of a
 * config otherwise kills the bundle with `ReferenceError: process is not
 * defined`. esbuild's `inject` substitutes these for unbound identifiers.
 */

/**
 * `"development"` for the same reason `eleventy.env.runMode` is `"serve"`: a
 * config gated on `NODE_ENV === "production"` shouldn't drag build-only
 * plugins into the mirror. Real values belong in `pluginOptions.globals`.
 *
 * esbuild defines the exact expression `process.env.NODE_ENV` itself, and that
 * wins over this object — changing the value here only affects indirect reads
 * like `const e = process.env`.
 */
export const process = {
	env: { NODE_ENV: "development" },
	argv: [],
	platform: "browser",
	version: "",
	versions: {},
	browser: true,
	cwd: () => "/",
	nextTick: (/** @type {any} */ fn, /** @type {any[]} */ ...args) =>
		queueMicrotask(() => fn(...args)),
};

export const __dirname = "/";
export const __filename = "/";

export default process;
