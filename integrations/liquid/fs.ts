import type { FS } from "liquidjs";
import { log, warn } from "./logger.js";

type InMemoryFs = FS & {
	statSync(): { isFile(): boolean };
	statAsync(): Promise<{ isFile(): boolean }>;
};

function hasExtension(filePath: string): boolean {
	const basename = filePath.slice(filePath.lastIndexOf("/") + 1);
	return basename.lastIndexOf(".") > 0;
}

export const inMemoryFs: InMemoryFs = {
	sep: "/",

	dirname(filePath: string): string {
		const parts = filePath.split("/");
		parts.pop();
		return parts.join("/") || "/";
	},

	readFileSync(filePath: string): string {
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

	async readFile(filePath: string): Promise<string> {
		if (!filePath) {
			throw new Error("readFile called with empty path");
		}
		return this.readFileSync(filePath);
	},

	existsSync(filePath: string): boolean {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		const fileContents = window.cc_liquid_files?.[filePath];
		return fileContents !== null && fileContents !== undefined;
	},

	async exists(filePath: string): Promise<boolean> {
		if (!filePath || typeof filePath !== "string") {
			return false;
		}
		return this.existsSync(filePath);
	},

	// LiquidJS calls this once per root and checks exists(), so no directory search needed.
	resolve(root: string, file: string, ext: string): string {
		const extension = ext || ".liquid";
		// Only append when the file has none, else "card.html" becomes "card.html.liquid".
		const fileWithExt = hasExtension(file) ? file : `${file}${extension}`;
		const normalizedRoot = root.replace(/^\.\//, "").replace(/\/*$/, "/");
		const resolved = `${normalizedRoot}${fileWithExt}`;
		log("resolve:", { root, file, ext }, "->", resolved);
		return resolved;
	},

	statSync() {
		return { isFile: () => true };
	},

	async statAsync() {
		return { isFile: () => true };
	},
};
