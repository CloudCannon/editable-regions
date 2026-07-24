// Browser override for the `diskSize` shortcode. Server-side it calls
// `fs.statSync` — impossible in the browser.
export default function diskSize() {
	return "—";
}
