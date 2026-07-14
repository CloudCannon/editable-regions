import { log, warn } from "./logger.mjs";

/**
 * In-memory filesystem for LiquidJS, reading from `window.cc_liquid_files`.
 * @type {any}
 */
export const inMemoryFs = {
	sep: "/",

	dirname(/** @type {string} */ filePath) {
		const parts = filePath.split("/");
		parts.pop();
		return parts.join("/") || "/";
	},

	readFileSync(/** @type {string} */ filePath) {
		const fileContents = window.cc_liquid_files?.[filePath];

		if (fileContents === undefined || fileContents === null) {
			const availableFiles = Object.keys(window.cc_liquid_files || {});
			warn("File not found:", filePath);
			log("Available files:", availableFiles);
			throw new Error(
				`ENOENT: Failed to find "${filePath}" in the bundled template files. Please check that this file exists and is within your configured component directories.`,
			);
		}

		return fileContents;
	},

	async readFile(/** @type {string} */ filePath) {
		if (!filePath) {
			throw new Error("readFile called with empty path");
		}
		return this.readFileSync(filePath);
	},

	existsSync(/** @type {string} */ filePath) {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		const fileContents = window.cc_liquid_files?.[filePath];
		return fileContents !== null && fileContents !== undefined;
	},

	async exists(/** @type {string} */ filePath) {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		return this.existsSync(filePath);
	},

	/**
	 * LiquidJS calls this once per root directory and checks `exists()` on the
	 * result, so no directory searching is needed here.
	 */
	resolve(
		/** @type {string} */ root,
		/** @type {string} */ file,
		/** @type {string} */ ext,
	) {
		const extension = ext || ".liquid";
		const fileWithExt = file.endsWith(extension) ? file : `${file}${extension}`;
		const normalizedRoot = root.replace(/^\.\//, "").replace(/\/*$/, "/");
		const resolved = `${normalizedRoot}${fileWithExt}`;
		log("resolve:", { root, file, ext }, "->", resolved);
		return resolved;
	},

	// The store is flat, so anything stat'd is a file.
	statSync() {
		return { isFile: () => true };
	},

	async statAsync() {
		return { isFile: () => true };
	},
};
