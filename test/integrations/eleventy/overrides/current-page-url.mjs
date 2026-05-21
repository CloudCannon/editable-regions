/**
 * Browser-side override for the `currentPageUrl` filter. The original
 * registration in `eleventy.config.mjs` reads `this.page.url`, which
 * doesn't exist in the live-editing bundle — this stand-in reads the
 * browser's `location.pathname` so the same template keeps working.
 */
export default function currentPageUrl() {
	return globalThis.location?.pathname ?? "";
}
