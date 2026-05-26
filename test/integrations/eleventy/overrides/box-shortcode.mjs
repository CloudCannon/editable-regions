// Browser-compatible replacement for the `box` paired shortcode.
// Server-side closes over `buildInfo.stamp` (module-level) — not serialisable.
export default function box(content) {
	return `<div class="box">${content}</div>`;
}
