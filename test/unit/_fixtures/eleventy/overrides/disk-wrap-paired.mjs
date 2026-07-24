// Browser override for the `diskWrap` paired shortcode. Server-side it
// calls `fs.statSync` — impossible in the browser.
export default function diskWrap(content) {
	return `<div data-size="—">${content}</div>`;
}
