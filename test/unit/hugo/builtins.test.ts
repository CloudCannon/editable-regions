/**
 * Bundle-path tests for Hugo's built-in template functions, filters, and
 * template helpers, rendered through the real WASM renderer against the
 * builtins-probe partial. Ground truth was captured with the native hugo
 * v0.164.0 binary (the same version the renderer bundles).
 */

import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
let probe: HTMLElement | null | undefined;

beforeAll(async () => {
	await loadHugoBundle();
	probe = await window.cc_components?.["builtins-probe"]({});
});

afterAll(restoreRendererStdout);

/** Renders the probe partial once and stores it; each row is a data-k div. */
function row(key: string): HTMLElement | null {
	return probe?.querySelector(`[data-k="${key}"]`) ?? null;
}

/** Trimmed text content of a probe row (result text minus markup). */
function text(key: string): string {
	return (row(key)?.textContent ?? "").trim();
}

/** Inner HTML of a probe row, for rows whose result is itself HTML. */
function html(key: string): string {
	return (row(key)?.innerHTML ?? "").trim();
}

// --- markup & content transforms ---

test("markdownify renders markdown to HTML", () => {
	expect(html("markdownify")).toBe("Bold <strong>markdown</strong> here.");
});

test("plainify strips HTML, leaving text", () => {
	expect(text("plainify")).toBe("Text with bold and link.");
});

test("htmlUnescape and htmlEscape decode/encode entities", () => {
	expect(text("htmlUnescape")).toBe('<b> & "quoted"');
	// htmlEscape returns a plain string, so the template layer escapes it a
	// second time — components get the double-escaped form unless they pipe
	// through safeHTML. Pinning the real behavior.
	expect(text("htmlEscape")).toBe("&lt;b&gt;&amp;amp;&lt;/b&gt;");
});

test("safeHTML emits raw HTML without escaping", () => {
	expect(html("safeHTML")).toBe("<span>raw</span>");
});

test("truncate cuts sensible boundaries and adds an ellipsis", () => {
	expect(text("truncate")).toBe("The quick …");
});

test("emojify expands shortcodes (emoji table is embedded in wasm)", () => {
	expect(text("emojify")).toBe("😄 party 🎉");
});

test("transform.Unmarshal parses YAML and JSON strings into maps", () => {
	expect(text("transformUnmarshalYaml")).toBe("Hello");
	expect(text("transformUnmarshalJson")).toBe("a=1;b=x");
});

test("transform.Remarshal converts YAML to JSON", () => {
	const out = text("transformRemarshal");
	expect(out.startsWith("{")).toBe(true);
	expect(out).toContain('"a": 1');
	expect(out).toContain('"b": "hi"');
});

test("transform.Highlight renders chroma markup with the language set", () => {
	const out = html("highlight");
	expect(out).toContain('class="language-js"');
	expect(out).toContain("console");
	expect(out).toContain("'hi'");
});

// --- string functions ---

test("upper, lower, and title transform case", () => {
	expect(text("upper")).toBe("HELLO WORLD");
	expect(text("lower")).toBe("hello world");
	expect(text("title")).toBe("The Quick Brown Fox");
});

test("chomp and trim strip surrounding characters", () => {
	expect(text("chomp")).toBe("padded");
	expect(text("trim")).toBe("padding");
});

test("replace and replaceRE substitute text and regex matches", () => {
	// replace is another piped-last func: `X | replace "old" "new"` lands X in
	// the "old" slot, so the probe uses the direct form.
	expect(text("replace")).toBe("baz-bar-baz");
	expect(text("replaceRE")).toBe("ab_cd_");
});

test("substr and slicestr slice strings (direct-call form)", () => {
	expect(text("substr")).toBe("World");
	expect(text("slicestr")).toBe("World");
});

test("strings.Split / Repeat / Contains / HasPrefix / TrimSpace / Count", () => {
	expect(text("strings.Split")).toBe("a|b||c"); // empty mid-element survives
	expect(text("strings.Repeat")).toBe("ababab");
	expect(text("strings.Contains")).toBe("true");
	expect(text("strings.HasPrefix")).toBe("true");
	expect(text("strings.TrimSpace")).toBe("hi");
	expect(text("strings.Count")).toBe("3"); // (substr, s) — haystack second
});

test("countwords counts fields; countrunes ignores whitespace", () => {
	expect(text("countwords")).toBe("4");
	expect(text("countrunes")).toBe("10");
});

test("findRE returns all matches as a slice", () => {
	expect(text("findRE")).toBe("12,34,5");
});

test("anchorize and urlize slugify; humanize/pluralize/singularize inflect", () => {
	expect(text("anchorize")).toBe("my-big-heading");
	expect(text("urlize")).toBe("my-first-post");
	expect(text("humanize")).toBe("First post slug");
	expect(text("pluralize")).toBe("cats");
	expect(text("singularize")).toBe("criterion");
});

// --- collections: slicing, ordering, uniqueness ---

test("slice/append/first/last/after shape collections", () => {
	expect(text("slice")).toBe("b-a-c");
	expect(text("append")).toBe("a-b-c-d");
	expect(text("first")).toBe("a,b"); // first 2 of [a,b,c]
	expect(text("last")).toBe("b,c"); // last 2 of [a,b,c]
	expect(text("after")).toBe("b,c"); // drop 1, keep the rest
});

test("uniq de-duplicates; sort orders strings; sort with key+desc orders maps", () => {
	expect(text("uniq")).toBe("a,b,c");
	expect(text("sort")).toBe("a,b,c");
	expect(text("sortDesc")).toBe("cba"); // keyed by `n`, descending
	expect(text("sortKeyed")).toBe("ab");
});

test("collections.Reverse reverses a slice", () => {
	expect(text("collections.Reverse")).toBe("c,b,a");
});

test("in tests membership; index reaches into containers", () => {
	expect(text("in")).toBe("true");
});

// --- collections: maps and combining ---

test("dict builds maps; dot and index access both work", () => {
	expect(text("dict")).toBe("v1v2");
});

test("merge combines maps with later arguments winning", () => {
	expect(text("mergeWar")).toBe('{"a":1,"b":2,"c":4}');
});

test("jsonify serializes maps (sorted keys) and slices with typed values", () => {
	expect(text("jsonifyMap")).toBe('{"a":1,"b":2}');
	expect(text("jsonifySlice")).toBe('[1,"two",3.5]');
});

test("seq generates inclusive number ranges", () => {
	expect(text("seq")).toBe("1,2,3,4");
});

test("complement/intersect/symdiff implement set operations", () => {
	expect(text("complement")).toBe("a,c");
	expect(text("intersect")).toBe("b,c");
	expect(text("symdiff")).toBe("d,a,b");
});

test("where filters a slice by key value; apply maps a function over it", () => {
	expect(text("where")).toBe("Home");
	expect(text("apply")).toBe("HI,BYE");
});

test("default falls back on empty and zero values", () => {
	expect(text("default")).toBe("fallback");
	expect(text("defaultNum")).toBe("42");
});

test("querify builds a URL query string with proper encoding", () => {
	expect(text("querify")).toBe("a=b+c&d=e");
});

// --- comparison / logic ---

test("comparison operators evaluate", () => {
	expect(text("eq")).toBe("true");
	expect(text("neq")).toBe("true");
	expect(text("lt")).toBe("true");
	expect(text("le")).toBe("true");
	expect(text("gt")).toBe("true");
	expect(text("ge")).toBe("true");
});

test("cond picks an argument by truthiness; or/not behave", () => {
	expect(text("cond")).toBe("yes");
	expect(text("or")).toBe("x");
	expect(text("not")).toBe("true");
});

// --- math ---

test("math.Add/Sub/Mul operate on ints and floats", () => {
	expect(text("mathAdd")).toBe("12");
	expect(text("mathAddFloats")).toBe("3");
	expect(text("mathSub")).toBe("8");
	expect(text("mathMul")).toBe("42");
});

test("math.Div truncates int division but preserves floats", () => {
	expect(text("mathDivInt")).toBe("2"); // 10/4 truncates
	expect(text("mathDivFloat")).toBe("3"); // 7.5/2.5 = 3
});

test("math.Mod / ModBool compute remainders", () => {
	expect(text("mathMod")).toBe("1");
	expect(text("mathModBool")).toBe("false;true");
});

test("math.Ceil / Floor / Round round numbers", () => {
	expect(text("mathCeil")).toBe("3");
	expect(text("mathFloor")).toBe("2");
	expect(text("mathRound")).toBe("3;2");
});

test("math.Max/Min/Pow/Abs/Sqrt cover the rest of the namespace", () => {
	expect(text("mathMax")).toBe("9");
	expect(text("mathMin")).toBe("4");
	expect(text("mathPow")).toBe("1024");
	expect(text("mathAbs")).toBe("7");
	expect(text("mathSqrt")).toBe("4");
});

// --- casts / conversions ---

test("cast.ToString / ToInt / ToFloat convert between types", () => {
	expect(text("castToString")).toBe("42");
	expect(text("castToInt")).toBe("42");
	expect(text("castToFloat")).toBe("1.25");
});

// --- time ---

test("time + dateFormat format dates (UTC-stable inputs)", () => {
	expect(text("timeFormat")).toBe("Jan 15, 2024");
	expect(text("dateFormat")).toBe("2024-01-15 10:30");
	expect(text("timeAsTimeFormat")).toBe("08:45 05/03/2024");
});

// --- paths & urls ---

test("path.Join/Base/Ext and urls.Parse manipulate paths", () => {
	expect(text("pathJoin")).toBe("a/b/c/d.html");
	expect(text("pathBase")).toBe("c.html");
	expect(text("pathExt")).toBe(".html");
	expect(text("urlsParse")).toBe("example.com");
});

test("relURL resolves against the site baseURL", () => {
	expect(text("relURL")).toBe("/css/style.css");
});

// --- hashing & encoding ---

test("sha256 / md5 havehes are stable (pinned values)", () => {
	expect(text("sha256")).toBe(
		"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
	);
	expect(text("md5")).toBe("5d41402abc4b2a76b9719d911017c592");
});

test("hash.FNV32a lives in the hash namespace (moved from crypto)", () => {
	expect(text("fnv32a")).toBe("1335831723");
});

test("hmac computes a keyed hash (hash, key, message order)", () => {
	expect(text("hmac")).toBe(
		"98e7ffb964bb5a3f902db1fc101a5baa98b6f2cd56858210c9d70f26ac762fc7",
	);
});

test("base64Encode / base64Decode round-trip", () => {
	expect(text("base64Encode")).toBe("aGVsbG8=");
	expect(text("base64Decode")).toBe("hello");
});

// --- printing & template helpers ---

test("printf formats with the classic verbs", () => {
	expect(text("printf")).toBe("count=99");
});

test("len counts elements; index on a string yields a byte value", () => {
	expect(text("len")).toBe("3");
	expect(text("indexString")).toBe("98");
});

test("templates.Exists reports whether a partial exists", () => {
	expect(text("templatesExists")).toBe("true");
	expect(text("templatesExistsMissing")).toBe("false");
});
