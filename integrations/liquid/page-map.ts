// Build-time permalink snapshot (JS config/eleventyComputed) invisible to live front-matter reads.
export type PageMapEntry = { url?: string; outputPath?: string };

let pageMap: Record<string, PageMapEntry> = {};

export function registerPageMap(
	map: Record<string, PageMapEntry> | null | undefined,
): void {
	pageMap = map ?? {};
}

export function getPageMap(): Record<string, PageMapEntry> {
	return pageMap;
}

// Normalises ./ or leading-slash forms so paths from different sources compare equal.
export function normalizeInputPath(p: string | null | undefined): string {
	if (typeof p !== "string" || !p) return "";
	return p.replace(/^\.\//, "").replace(/^\/+/, "");
}
