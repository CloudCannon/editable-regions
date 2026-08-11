/**
 * Dedicated tests for the globals a component can reach when the renderer
 * renders it: the `site` global object (a real Hugo `Site`), the `hugo.*`
 * namespace, and query helpers over site data. Components receive props as
 * their context, so the supported global-data surface is exactly what these
 * probe partials exercise — the same calls a user component partial makes.
 *
 * Runs the actual WASM renderer directly (see _helpers/wasm-renderer.ts);
 * the probe partials and data files are written into the renderer's
 * in-memory filesystem, like the browser runtime's snapshot would.
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import {
	bootRenderer,
	initEditorSite,
	render,
	restoreRendererStdout,
} from "../_helpers/wasm-renderer";

// The editor-site config in the exact shape the runtime's buildEditorConfig
// writes for the WASM site: baseURL "/", title, `locale` (the key
// editable-regions/site-config.html emits — a real Hugo key,
// langs.LanguageConfig.Locale, so site.Language.Locale resolves it), params,
// and menus. The runtime adds disableKinds on top.
const editorConfig = {
	baseURL: "/",
	title: "Globals Test Site",
	locale: "en-AU",
	disableKinds: ["taxonomy", "term", "RSS", "sitemap", "robotsTXT", "404"],
	params: {
		brand: "Global Brand",
		extra: { region: "apac" },
		tags: ["one", "two"],
	},
	menus: {
		main: [
			{ name: "Home", url: "/", weight: 1 },
			{ name: "Blog", url: "/blog/", weight: 2 },
		],
		footer: [{ name: "Privacy", url: "/privacy/", weight: 1 }],
	},
};

// Each probe emits one field per line so assertions read intact values.
const probe = (lines: string[]): string =>
	lines.map((l) => `<div>${l}</div>`).join("\n");

const siteFiles: Record<string, string> = {
	"config.json": JSON.stringify(editorConfig),
	// Site title.
	"layouts/partials/globals-title.html": "<div>{{ site.Title }}</div>",
	// Params: dotted access, nested maps, arrays, and site.Param.
	"layouts/partials/globals-params.html": probe([
		"{{ site.Params.brand }}",
		"{{ site.Params.extra.region }}",
		'{{ delimit site.Params.tags "," }}',
		'{{ site.Param "brand" }}',
	]),
	// Menus: entries carry name/url/weight; footer menu exists under its key.
	"layouts/partials/globals-menus.html": probe([
		"{{ range site.Menus.main }}{{ .Name }}={{ .URL }}@{{ .Weight }};{{ end }}",
		"{{ site.Menus.footer | len }}",
	]),
	// Language identity: modern accessors plus the deprecated one.
	"layouts/partials/globals-language.html": probe([
		"lang={{ site.Language.Lang }}",
		"locale={{ site.Language.Locale }}",
		"code={{ site.LanguageCode }}",
	]),
	// BaseURL and relative URL resolution.
	"layouts/partials/globals-baseurl.html": probe([
		"{{ site.BaseURL }}",
		'{{ relURL "styles.css" }}',
	]),
	// Data files: yaml + json (hugo.Data is the non-deprecated accessor).
	"layouts/partials/globals-data.html": probe([
		"{{ range hugo.Data.nav.links }}{{ .label }};{{ end }}",
		"{{ hugo.Data.social.twitter }}",
		"siteDataLen={{ site.Data.nav.links | len }}",
	]),
	// Query helpers over global data.
	"layouts/partials/globals-query.html": probe([
		'{{ with where hugo.Data.nav.links "url" "/" }}{{ (index . 0).label }}{{ end }}',
		"{{ (index hugo.Data.nav.links 0).label }}",
		'{{ default "fallback" hugo.Data.nav.missing }}',
	]),
	// Page collections over the editor site (a single stub home page).
	"layouts/partials/globals-collections.html": probe([
		"regularPages={{ len site.RegularPages }}",
		"pages={{ len site.Pages }}",
		"sections={{ len site.Sections }}",
		"homeTitle={{ site.Home.Title }}",
		"homeRegularPages={{ len site.Home.RegularPages }}",
	]),
	// GetPage lookups.
	"layouts/partials/globals-getpage.html": probe([
		'{{ with site.GetPage "/" }}home={{ .Title }}{{ else }}missing{{ end }}',
		'{{ with site.GetPage "/about/" }}found{{ else }}missing{{ end }}',
	]),
	// The hugo.* namespace.
	"layouts/partials/globals-hugo.html": probe([
		"version={{ hugo.Version }}",
		"server={{ hugo.IsServer }}",
		"env={{ hugo.Environment }}",
		"production={{ hugo.IsProduction }}",
		"development={{ hugo.IsDevelopment }}",
		"extended={{ hugo.IsExtended }}",
		"multilingual={{ hugo.IsMultilingual }}",
		"wd={{ hugo.WorkingDir }}",
	]),
	// The sites dimension list.
	"layouts/partials/globals-sites.html": probe([
		"{{ len hugo.Sites }}",
		"{{ (index hugo.Sites 0).Title }}",
	]),
	// site stays in scope when a component delegates to a nested partial.
	"layouts/partials/globals-parent.html":
		'{{ partial "globals-title.html" . }}',
	// Data file used by the probes above.
	"data/nav.yaml":
		"links:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog/\n",
	"data/social.json": '{"twitter": "https://twitter.com/cloudcannon"}',
};

function lines(html: string | undefined): string {
	return (html ?? "").replace(/<[^>]+>/g, "").trim();
}

beforeAll(async () => {
	await bootRenderer();
	initEditorSite(siteFiles);
});

afterAll(restoreRendererStdout);

// --- site.* -----------------------------------------------------------------

test("components can read site.Title", () => {
	const { html, error } = render("globals-title.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("Globals Test Site");
});

test("site.Params exposes params by dotted path, nested, array, and site.Param", () => {
	const { html, error } = render("globals-params.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("Global Brand\napac\none,two\nGlobal Brand");
});

test("site.Menus holds named menus with name, url, and weight", () => {
	const { html, error } = render("globals-menus.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("Home=/@1;Blog=/blog/@2;\n1");
});

test("site.Language exposes lang and locale", () => {
	const { html, error } = render("globals-language.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("lang=en\nlocale=en-AU\ncode=en-AU");
});

test("site.BaseURL and relURL resolve relative URLs", () => {
	const { html, error } = render("globals-baseurl.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("/\n/styles.css");
});

// --- data --------------------------------------------------------------------

test("data files are accessible as site data (yaml + json)", () => {
	const { html, error } = render("globals-data.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe(
		"Home;Blog;\nhttps://twitter.com/cloudcannon\nsiteDataLen=2",
	);
});

test("site data can be queried with where, index, and default", () => {
	const { html, error } = render("globals-query.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("Home\nHome\nfallback");
});

// --- pages -------------------------------------------------------------------

test("page collections are safe and empty-ish in the editor site", () => {
	const { html, error } = render("globals-collections.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe(
		"regularPages=0\npages=1\nsections=0\nhomeTitle=\nhomeRegularPages=0",
	);
});

test("site.GetPage resolves the home page and misses elsewhere", () => {
	const { html, error } = render("globals-getpage.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("home=\nmissing");
});

// --- hugo.* namespace --------------------------------------------------------

test("hugo.* reports the version and the editor runtime flags", () => {
	const { html, error } = render("globals-hugo.html");
	expect(error).toBeUndefined();
	const parts = lines(html).split("\n");
	expect(parts).toEqual([
		expect.stringMatching(/^version=0\.\d+\.\d+/),
		"server=true",
		"env=production",
		"production=true",
		"development=false",
		"extended=false",
		"multilingual=false",
		"wd=",
	]);
});

test("hugo.Sites lists the editor site", () => {
	const { html, error } = render("globals-sites.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("1\nGlobals Test Site");
});

// --- composition --------------------------------------------------------------

test("site stays in scope inside a nested partial the component calls", () => {
	const { html, error } = render("globals-parent.html");
	expect(error).toBeUndefined();
	expect(lines(html)).toBe("Globals Test Site");
});
