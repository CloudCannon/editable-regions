// Browser override for the `readmeSize` filter. Server-side it calls
// `fs.statSync` to read a file's size from disk — impossible in the browser,
// where the bundled `node:fs` stub throws if called. This portable
// replacement returns a placeholder so live-editing renders keep working.
export default function readmeSize() {
	return "—";
}
