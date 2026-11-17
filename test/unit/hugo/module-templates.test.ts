/** The snapshot merges theme/vendored-module trees under project files, so a project partial shadows a same-named theme partial. */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	loadHugoBundle,
	restoreRendererStdout,
} from "../_helpers/hugo-bundle.js";
import type { MockFile } from "../_mocks/cloudcannon.js";
import {
	makeMockCollection,
	setMockCollectionsList,
} from "../_mocks/cloudcannon.js";

function mkFile(path: string, frontMatter: Record<string, any>): MockFile {
	return {
		path,
		data: { get: () => Promise.resolve(frontMatter) },
		get: () => Promise.resolve(""),
		content: { get: () => Promise.resolve("") },
	};
}

const home = mkFile("/content/_index.md", {
	title: "Home",
	date: "2024-01-01",
});
const one = mkFile("/content/blog/one.md", {
	title: "One",
	author: "alice",
	date: "2025-01-15",
});

setMockCollectionsList([makeMockCollection("content", [home, one])]);

beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

function text(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

async function render(key: string, props: Record<string, any> = {}) {
	return window.cc_components?.[key]?.(props);
}

test("a component partial provided by a theme renders", async () => {
	const el = await render("themed-hero");
	expect(text(el)).toBe("themed-hero-from-proot");
});

test("ENV_CLIENT is true in the editor's renderer", async () => {
	const el = await render("env-probe");
	expect(text(el)).toBe("env=[true]");
});

test("nested partial includes resolve across the theme tree", async () => {
	const el = await render("themed-outer");
	expect(text(el)).toContain("themed-inner-from-proot");
});

test("a project partial shadows a theme partial with the same name", async () => {
	const el = await render("dupe");
	expect(text(el)).toBe("from-project");
	expect(text(el)).not.toContain("from-theme-proot");
});

test("a shortcode from a theme expands inside component markdown", async () => {
	const el = await render("theme-shout", {
		body: "Here is {{< themed-shout >}}loud{{< /themed-shout >}}.",
	});
	expect(text(el)).toContain("theme-shout-probe");
	expect(text(el)).toContain("Here is THEME-SHOUT:[=loud=]");
});

test("a render hook from a theme applies to component markdownify", async () => {
	const el = await render("theme-hook");
	expect(text(el)).toBe(
		"theme-hook-probe: THEME-HOOK:[docs → https://example.com/]",
	);
});

test("a component partial from a vendored module renders", async () => {
	const el = await render("vendored-card");
	expect(text(el)).toBe("vendored-from-module");
});

test("vendored module data and i18n mounts render, and unmounted theme data", async () => {
	const el = await render("vendor-mounts-probe");
	expect(el?.querySelector(".vendor-data")?.textContent).toBe(
		"from-vendor-data",
	);
	expect(el?.querySelector(".vendor-i18n")?.textContent).toBe(
		"Vendored translation",
	);
	expect(el?.querySelector(".vendor-file-mount")?.textContent?.trim()).toBe(
		"from-vendor-file-mount",
	);
	expect(el?.querySelector(".local-module-probe")?.textContent?.trim()).toBe(
		"from-local-module",
	);
	expect(el?.querySelector(".theme-data")?.textContent).toBe("from-theme-data");
});
