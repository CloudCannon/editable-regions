/**
 * Hugo 0.146 renamed the template dirs (partials/ → _partials/, shortcodes/ →
 * _shortcodes/, _default/_markup/ → _markup/) and still reads both. The
 * fixture puts one template of each kind in each style: both are snapshotted,
 * and both resolve in the editor's renderer.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";
import type { MockFile } from "../_mocks/cloudcannon";
import {
	makeMockCollection,
	setMockCollectionsList,
} from "../_mocks/cloudcannon";

const home: MockFile = {
	path: "/content/_index.md",
	data: { get: () => Promise.resolve({ title: "Home", date: "2024-01-01" }) },
	get: () => Promise.resolve(""),
	content: { get: () => Promise.resolve("") },
};

setMockCollectionsList([makeMockCollection("content", [home])]);

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

/** The snapshot's template files, as shipped on cc_hugo_files. */
function snapshotFiles(): Record<string, string> {
	return (window as any).cc_hugo_files ?? {};
}

/** Strip tags, keep the text. */
function text(el: HTMLElement | null | undefined): string {
	return (el?.innerHTML ?? "").replace(/<[^>]+>/g, "").trim();
}

async function render(key: string, props: Record<string, any> = {}) {
	return window.cc_components?.[key]?.(props);
}

test("templates in both legacy and new dirs are snapshotted", () => {
	const files = snapshotFiles();
	expect(files["layouts/partials/card.html"]).toBeDefined();
	expect(files["layouts/_partials/new-dir-card.html"]).toBeDefined();
	expect(files["layouts/shortcodes/legacy-shout.html"]).toBeDefined();
	expect(files["layouts/_shortcodes/new-dir-shout.html"]).toBeDefined();
	expect(
		files["layouts/_default/_markup/render-codeblock-cclegacy.html"],
	).toBeDefined();
	expect(files["layouts/_markup/render-codeblock-ccnew.html"]).toBeDefined();
	expect(
		files["layouts/blog/_markup/render-codeblock-ccsection.html"],
	).toBeDefined();
});

test("a component partial in _partials renders, with or without its extension", async () => {
	const bare = await render("new-dir-card");
	const explicit = await render("new-dir-card.html");
	expect(bare?.querySelector(".new-dir-card")?.textContent).toBe(
		"from-new-partials-dir",
	);
	expect(bare?.outerHTML).toBe(explicit?.outerHTML);
});

test("shortcodes from both shortcodes and _shortcodes expand in component markdown", async () => {
	const el = await render("template-dirs-probe", {
		body:
			"{{< legacy-shout >}}old{{< /legacy-shout >}} " +
			"{{< new-dir-shout >}}new{{< /new-dir-shout >}}",
	});
	expect(text(el)).toContain("LEGACY-SHOUT:[=old=]");
	expect(text(el)).toContain("NEW-SHOUT:[=new=]");
});

test("render hooks from both _default/_markup and _markup apply to component markdown", async () => {
	const el = await render("template-dirs-probe", {
		body: "```cclegacy\nold\n```\n\n```ccnew\nnew\n```\n",
	});
	expect(text(el)).toContain("LEGACY-HOOK:[old]");
	expect(text(el)).toContain("NEW-HOOK:[new]");
});
