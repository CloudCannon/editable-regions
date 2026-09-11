/**
 * resources namespace tests through the real WASM renderer: local lookups
 * resolve against memfs asset mounts, and GetRemote settles through the async
 * render path with fetch stubbed in the host process (no real network).
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	renderBatch,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

const siteFiles = {
	"config.json": JSON.stringify({
		baseURL: "/",
		title: "Renderer unit test",
	}),
	"assets/data.txt": "asset-data\n",
	"assets/img/logo.svg": "<svg>logo</svg>",
	"assets/svg/icon-a.svg": "<svg>a</svg>",
	"assets/svg/icon-b.svg": "<svg>b</svg>",
	"layouts/partials/resources-probe.html": [
		'<div data-k="get">{{ with resources.Get "data.txt" }}{{ .Content }}{{ else }}MISSING{{ end }}</div>',
		'<div data-k="getMatch">{{ with resources.GetMatch "svg/icon-a.svg" }}{{ .Name }}{{ else }}MISSING{{ end }}</div>',
		'<div data-k="match">{{ range resources.Match "svg/*.svg" }}{{ .Name }};{{ end }}</div>',
		'<div data-k="byType">{{ range resources.ByType "image" }}{{ .Name }};{{ end }}</div>',
		'<div data-k="getMissing">{{ with resources.Get "nope.txt" }}GOT{{ else }}absent{{ end }}</div>',
	].join("\n"),
	"layouts/partials/remote-probe.html": [
		'<div data-k="remoteOk">{{ with resources.GetRemote "https://assets.example.com/hero.txt" }}{{ .Content }}{{ else }}MISSING{{ end }}</div>',
		'<div data-k="remoteFail">{{ with resources.GetRemote "https://assets.example.com/missing.txt" }}GOT{{ else }}nope{{ end }}</div>',
	].join("\n"),
	"layouts/partials/remote-slow-probe.html": [
		'<div data-k="remoteSlow">{{ with resources.GetRemote "https://assets.example.com/slow.txt" }}{{ .Content }}{{ else }}MISSING{{ end }}</div>',
		"<div data-k=\"plainNeighbor\">neighbor</div>",
	].join("\n"),
	"layouts/_default/_markup/render-image.html": [
		'{{ $remote := resources.GetRemote .Destination }}',
		'<img src="{{ .Destination }}" data-remote="{{ with $remote }}{{ .Content }}{{ else }}no-remote{{ end }}">',
	].join(""),
	"content/notes/hooked.md":
		"---\ntitle: Hooked\n---\n\n![Hero](https://assets.example.com/hero.txt)\n",
	"content/notes/hooked-missing.md":
		"---\ntitle: Hooked Missing\n---\n\n![Hero](https://assets.example.com/missing.txt)\n",
	"layouts/partials/hook-probe.html": '<div data-k="hooked">{{ page.Content }}</div>',
};

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
}, 120_000);

afterAll(restoreRendererStdout);

/** Row content out of a probe render's html, keyed by the data-k div. */
function row(html: string | undefined, key: string): string {
	const match = html?.match(new RegExp(`data-k="${key}">([\\s\\S]*?)</div>`));
	return (match?.[1] ?? "").trim();
}

/** Fetch stub answering the example.com probe URLs; `delay` in ms. */
function stubFetch(delay = 0): ReturnType<typeof vi.fn> {
	return vi.fn(async (url: string | URL | Request) => {
		const href = typeof url === "string" ? url : url.toString();
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
		if (href.endsWith("missing.txt")) {
			return new Response("gone", { status: 404 });
		}
		return new Response("remote-body", {
			status: 200,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

test("resources.Get resolves a text asset from the memfs", async () => {
	const { html, error } = await render("resources-probe.html");
	expect(error).toBeUndefined();
	expect(row(html, "get")).toBe("asset-data");
});

test("resources.Get reports missing assets without failing the render", async () => {
	const { html, error } = await render("resources-probe.html");
	expect(error).toBeUndefined();
	expect(row(html, "getMissing")).toBe("absent");
});

test("resources.GetMatch and Match glob the asset mounts", async () => {
	const { html, error } = await render("resources-probe.html");
	expect(error).toBeUndefined();
	expect(row(html, "getMatch")).toBe("/svg/icon-a.svg");
	expect(row(html, "match")).toBe("/svg/icon-a.svg;/svg/icon-b.svg;");
});

test("resources.ByType filters by media type", async () => {
	const { html, error } = await render("resources-probe.html");
	expect(error).toBeUndefined();
	expect(row(html, "byType")).toBe(
		"/img/logo.svg;/svg/icon-a.svg;/svg/icon-b.svg;",
	);
});

test("resources.GetRemote fetches, and a failed fetch settles without failing the batch", async () => {
	vi.stubGlobal("fetch", stubFetch());
	const { html, error } = await render("remote-probe.html");
	expect(error).toBeUndefined();
	expect(row(html, "remoteOk")).toBe("remote-body");
	expect(row(html, "remoteFail")).toBe("nope");
});

test("a batch mixing a slow GetRemote with a plain partial delivers both", async () => {
	vi.stubGlobal("fetch", stubFetch(100));
	const { html, error } = await renderBatch([
		{ id: "cc-render-0", partial: "remote-slow-probe.html" },
	]);
	expect(error).toBeUndefined();
	expect(row(html, "remoteSlow")).toBe("remote-body");
	expect(row(html, "plainNeighbor")).toBe("neighbor");
});

test("a render hook calling GetRemote runs inside the page markdown render", async () => {
	vi.stubGlobal("fetch", stubFetch());
	const { html, error } = await renderBatch(
		[{ id: "cc-render-0", partial: "hook-probe.html" }],
		"content/notes/hooked.md",
	);
	expect(error).toBeUndefined();
	expect(row(html, "hooked")).toContain(
		'src="https://assets.example.com/hero.txt"',
	);
	expect(row(html, "hooked")).toContain('data-remote="remote-body"');
});

test("a render hook with a failed GetRemote settles the page render", async () => {
	vi.stubGlobal("fetch", stubFetch());
	const { html, error } = await renderBatch(
		[{ id: "cc-render-0", partial: "hook-probe.html" }],
		"content/notes/hooked-missing.md",
	);
	expect(error).toBeUndefined();
	expect(row(html, "hooked")).toContain('data-remote="no-remote"');
});
