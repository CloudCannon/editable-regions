/** Substituted by esbuild `inject` for unbound globals; otherwise a bare `process` kills the bundle at load. */

/** esbuild defines `process.env.NODE_ENV` itself, so this value only affects indirect reads like `const e = process.env`. */
export const process = {
	env: { NODE_ENV: "development" },
	argv: [] as string[],
	platform: "browser",
	version: "",
	versions: {} as Record<string, string>,
	browser: true,
	cwd: () => "/",
	nextTick: (fn: (...args: any[]) => void, ...args: any[]) =>
		queueMicrotask(() => fn(...args)),
};

export const __dirname = "/";
export const __filename = "/";

export default process;
