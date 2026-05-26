// Browser-compatible replacement for the `stamp` filter.
// Server-side closes over `buildInfo` (module-level object) — not serialisable.
export default function stamp(s) {
	return `${s} [browser]`;
}
