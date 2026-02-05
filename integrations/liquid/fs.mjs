import { log, warn } from "./logger.mjs";

/**
 * Creates an in-memory filesystem for LiquidJS that reads from window.cc_files.
 *
 * @param {Object} options - Filesystem options
 * @param {string[]} [options.componentDirs] - Component directories to search
 * @returns {any} LiquidJS-compatible filesystem object
 */
export function createInMemoryFs(options = {}) {
	const { componentDirs = ["src/_includes/"] } = options;

	// Normalize all directories to have trailing slashes
	const normalizedDirs = componentDirs.map((dir) =>
		dir.endsWith("/") ? dir : `${dir}/`,
	);

	return {
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
		 * Resolves a file path, searching through component directories.
		 *
		 * @param {string} root - The root directory (unused, for LiquidJS compatibility)
		 * @param {string} file - The file name to resolve
		 * @param {string} [ext] - The file extension (defaults to ".liquid")
		 * @returns {string} The resolved file path
		 */
		resolve(root, file, ext) {
			// If file already looks like a full path in cc_files, return as-is
			if (window.cc_files?.[file]) {
				log("resolve:", { root, file, ext }, "-> found exact match:", file);
				return file;
			}

			// Build the filename with extension
			const extension = ext || ".liquid";
			const fileWithExt = file.endsWith(extension)
				? file
				: `${file}${extension}`;

			// Search through all component directories for the file
			for (const dir of normalizedDirs) {
				const fullPath = `${dir}${fileWithExt}`;
				if (window.cc_files?.[fullPath]) {
					log(
						"resolve:",
						{ root, file, ext },
						"-> found in",
						dir,
						":",
						fullPath,
					);
					return fullPath;
				}
			}

			// Fallback to first directory (for better error messages)
			const fallbackPath = `${normalizedDirs[0]}${fileWithExt}`;
			log("resolve:", { root, file, ext }, "-> fallback to:", fallbackPath);
			return fallbackPath;
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
}
