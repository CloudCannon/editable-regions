import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

test("Image renders an <img> with the provided src, alt, width, and height", async () => {
	const el = await window.cc_components?.["astro-assets-image"]({
		src: "/test.png",
		alt: "Test image",
		width: 80,
		height: 60,
	});

	const img = el?.querySelector(".assets-image img");
	expect(img).toBeTruthy();
	expect(img?.getAttribute("src")).toBe("/test.png");
	expect(img?.getAttribute("alt")).toBe("Test image");
	expect(img?.getAttribute("width")).toBe("80");
	expect(img?.getAttribute("height")).toBe("60");
});

test("Image uses default props when none are provided", async () => {
	const el = await window.cc_components?.["astro-assets-image"]({});

	const img = el?.querySelector(".assets-image img");
	expect(img?.getAttribute("src")).toBe("/test-image.png");
	expect(img?.getAttribute("alt")).toBe("Test image");
	expect(img?.getAttribute("width")).toBe("100");
	expect(img?.getAttribute("height")).toBe("100");
});

test("Image accepts string width/height and parses them to numbers", async () => {
	const el = await window.cc_components?.["astro-assets-image"]({
		src: "/test.png",
		alt: "Test",
		width: "120",
		height: "90",
	});

	const img = el?.querySelector(".assets-image img");
	expect(img?.getAttribute("width")).toBe("120");
	expect(img?.getAttribute("height")).toBe("90");
});

test("the rendered Image matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-assets-image"]({
		src: "/snap.png",
		alt: "Snapshot image",
		width: 50,
		height: 50,
	});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("getImage returns an object with the src and expected shape", async () => {
	const el = await window.cc_components?.["astro-assets-get-image"]({
		src: "/optimized.png",
	});

	expect(el?.querySelector(".optimized-src")?.textContent).toBe(
		"/optimized.png",
	);
	expect(el?.querySelector(".src-set-count")?.textContent).toBe("0");
});

test("getImage uses the default src when none is provided", async () => {
	const el = await window.cc_components?.["astro-assets-get-image"]({});

	expect(el?.querySelector(".optimized-src")?.textContent).toBe(
		"/test-image.png",
	);
});

test("Picture wraps an <img> in a <picture> element", async () => {
	const el = await window.cc_components?.["astro-assets-picture"]({
		src: "/pic.png",
		alt: "Test picture",
		width: 40,
		height: 40,
	});

	const picture = el?.querySelector(".assets-picture picture");
	expect(picture).toBeTruthy();
	const img = picture?.querySelector("img");
	expect(img?.getAttribute("src")).toBe("/pic.png");
	expect(img?.getAttribute("alt")).toBe("Test picture");
});

test("the rendered Picture matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-assets-picture"]({
		src: "/snap.png",
		alt: "Snapshot picture",
		width: 50,
		height: 50,
	});

	expect(el?.outerHTML).toMatchSnapshot();
});
