import { log, warn } from "./logger.mjs";

/**
 * In-memory filesystem for LiquidJS that reads from window.cc_files.
 *
 * @type {any} LiquidJS-compatible filesystem object
 */
export const inMemoryFs = {
	sep: "/",

	/**
	 * Gets the directory name from a file path.
	 *
	 * @param {string} filePath - The file path
	 * @returns {string} The directory portion of the path
	 */
	dirname(filePath) {
		const parts = filePath.split("/");
		parts.pop();
		return parts.join("/") || "/";
	},

	/**
	 * Synchronously reads a file from the in-memory store.
	 *
	 * @param {string} filePath - The file path to read
	 * @returns {string | undefined} The file contents or undefined if not found
	 */
	readFileSync(filePath) {
		log("readFileSync:", filePath);
		const fileContents = window.cc_files?.[filePath];

		if (fileContents === undefined) {
			const availableFiles = Object.keys(window.cc_files || {});
			warn("File not found:", filePath);
			log("Available files:", availableFiles);
		} else {
			log("File found, length:", fileContents?.length || 0);
		}

		return fileContents;
	},

	/**
	 * Asynchronously reads a file from the in-memory store.
	 *
	 * @param {string} filePath - The file path to read
	 * @returns {Promise<string>} The file contents
	 * @throws {Error} If filePath is empty
	 */
	async readFile(filePath) {
		log("readFile:", filePath);
		if (!filePath) {
			throw new Error("readFile called with empty path");
		}
		return this.readFileSync(filePath);
	},

	/**
	 * Asynchronously checks if a file exists.
	 *
	 * @param {string} filePath - The file path to check
	 * @returns {Promise<boolean>} True if the file exists
	 */
	async exists(filePath) {
		if (!filePath || typeof filePath !== "string") {
			log("exists: invalid path", filePath);
			return false;
		}
		const result = this.existsSync(filePath);
		log("exists:", filePath, "=", result);
		return result;
	},

	/**
	 * Synchronously checks if a file exists.
	 *
	 * @param {string} filePath - The file path to check
	 * @returns {boolean} True if the file exists
	 */
	existsSync(filePath) {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		const fileContents = window.cc_files?.[filePath];
		const exists = fileContents !== null && fileContents !== undefined;
		log("existsSync:", filePath, "=", exists);
		return exists;
	},

	/**
	 * Resolves a file path by joining the root with the file name and extension.
	 * LiquidJS calls this once per root directory and checks exists() on the
	 * result, so no directory searching is needed here.
	 *
	 * @param {string} root - The root directory provided by LiquidJS
	 * @param {string} file - The file name to resolve
	 * @param {string} [ext] - The file extension (defaults to ".liquid")
	 * @returns {string} The resolved file path
	 */
	resolve(root, file, ext) {
		const extension = ext || ".liquid";
		const fileWithExt = file.endsWith(extension) ? file : `${file}${extension}`;
		const normalizedRoot = root.replace(/^\.\//, "").replace(/\/*$/, "/");
		const resolved = `${normalizedRoot}${fileWithExt}`;
		log("resolve:", { root, file, ext }, "->", resolved);
		return resolved;
	},

	/**
	 * Returns file stat (always returns isFile: true for compatibility).
	 *
	 * @returns {Promise<{isFile: () => boolean}>}
	 */
	async statAsync() {
		return { isFile: () => true };
	},

	/**
	 * Returns file stat synchronously (always returns isFile: true for compatibility).
	 *
	 * @returns {{isFile: () => boolean}}
	 */
	statSync() {
		return { isFile: () => true };
	},
};
