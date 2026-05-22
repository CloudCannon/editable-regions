import { log, warn } from "./logger.mjs";

/**
 * In-memory filesystem for LiquidJS that reads from window.cc_liquid_files.
 *
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
		log("readFileSync:", filePath);
		const fileContents = window.cc_liquid_files?.[filePath];

		if (fileContents === undefined || fileContents === null) {
			const availableFiles = Object.keys(window.cc_liquid_files || {});
			warn("File not found:", filePath);
			log("Available files:", availableFiles);
			throw new Error(
				`ENOENT: Failed to find "${filePath}" in the bundled template files. Please check that this file exists and is within your configured component directories.`,
			);
		}

		log("File found, length:", fileContents?.length || 0);
		return fileContents;
	},

	async readFile(/** @type {string} */ filePath) {
		log("readFile:", filePath);
		if (!filePath) {
			throw new Error("readFile called with empty path");
		}
		return this.readFileSync(filePath);
	},

	async exists(/** @type {string} */ filePath) {
		if (!filePath || typeof filePath !== "string") {
			log("exists: invalid path", filePath);
			return false;
		}
		const result = this.existsSync(filePath);
		log("exists:", filePath, "=", result);
		return result;
	},

	existsSync(/** @type {string} */ filePath) {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		const fileContents = window.cc_liquid_files?.[filePath];
		const exists = fileContents !== null && fileContents !== undefined;
		log("existsSync:", filePath, "=", exists);
		return exists;
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

	// `statAsync`/`statSync` always claim isFile: true — the in-memory store
	// is flat, so anything we'd be asked to stat is a file.
	async statAsync() {
		return { isFile: () => true };
	},

	statSync() {
		return { isFile: () => true };
	},
};
