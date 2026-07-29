// Browser override for the `readmeSize` filter. Server-side it calls
// `fs.statSync` — impossible in the browser. This portable replacement
// returns a placeholder.
export default function readmeSize() {
	return "—";
}
