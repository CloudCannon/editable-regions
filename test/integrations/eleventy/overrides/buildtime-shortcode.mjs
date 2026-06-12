// Browser-compatible replacement for the `buildTime` shortcode.
// Server-side closes over `buildInfo.stamp` (module-level) — not serialisable.
export default function buildTime() {
	return new Date().toISOString();
}
