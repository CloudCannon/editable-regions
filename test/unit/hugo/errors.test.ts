/**
 * Parser for the chained template errors the Hugo renderer returns; ground
 * truth is a real bookshop → grid → shortcode → GetRemote failure from the
 * petite-dahlia site.
 */

import { describe, expect, test } from "vitest";

import {
	enhanceHugoError,
	parseHugoTemplateError,
} from "../../../integrations/hugo/browser/errors.ts";

const PETITE_DAHLIA_ERROR = [
	'template: __cc-dispatch.html:14:58: executing "__cc-dispatch.html" at : error calling partial: "_vendor/github.com/cloudcannon/bookshop/hugo/v3/core/bookshop.html:55:8": execute of template failed: ',
	'template: _partials/bookshop.html:55:8: executing "_partials/bookshop.html" at : error calling partial: "_vendor/github.com/cloudcannon/bookshop/hugo/v3/core/helpers/component.html:34:3": execute of template failed: ',
	'template: _partials/_bookshop/helpers/component.html:34:3: executing "_partials/_bookshop/helpers/component.html" at : error calling partial: "component-library/components/grid/grid.hugo.html:45:131": execute of template failed: ',
	'template: _partials/bookshop/components/grid/grid.hugo.html:45:131: executing "_partials/bookshop/components/grid/grid.hugo.html" at : error calling markdownify: "content/en/_index.md:1:1": failed to render shortcode "figure": failed to process shortcode: "layouts/shortcodes/figure.html:28:7": execute of template failed: ',
	'template: _shortcodes/figure.html:28:7: executing "_shortcodes/figure.html" at : error calling partial: "layouts/partials/img.html:63:41": execute of template failed: ',
	'template: _partials/img.html:63:41: executing "_partials/img.html" at : error calling GetRemote: Get "https://cdn.nddmed.com/pages/nycskyline.jpg": net/http: fetch() failed: TypeError: NetworkError when attempting to fetch resource.',
].join("");

describe("parseHugoTemplateError", () => {
	test("flattens the chain into outermost-first template refs", () => {
		const parsed = parseHugoTemplateError(PETITE_DAHLIA_ERROR);
		expect(parsed.frames).toEqual([
			"__cc-dispatch.html:14:58",
			"_partials/bookshop.html:55:8",
			"_partials/_bookshop/helpers/component.html:34:3",
			"_partials/bookshop/components/grid/grid.hugo.html:45:131",
			"_shortcodes/figure.html:28:7",
			"_partials/img.html:63:41",
		]);
	});

	test("the leaf is the underlying error with the failing call named", () => {
		const parsed = parseHugoTemplateError(PETITE_DAHLIA_ERROR);
		expect(parsed.call).toBe("GetRemote");
		expect(parsed.message).toBe(
			'Get "https://cdn.nddmed.com/pages/nycskyline.jpg": net/http: fetch() failed: TypeError: NetworkError when attempting to fetch resource.',
		);
	});

	test("a single-frame chain parses to its leaf", () => {
		const parsed = parseHugoTemplateError(
			'template: __cc-dispatch.html:14:58: executing "__cc-dispatch.html" at : error calling partial: "_partials/x.html:9:1": execute of template failed: explode: bad thing happened',
		);
		expect(parsed.frames).toEqual(["__cc-dispatch.html:14:58"]);
		expect(parsed.call).toBe("partial");
		expect(parsed.message).toBe("explode: bad thing happened");
	});

	test("a plain message passes through untouched", () => {
		const parsed = parseHugoTemplateError(
			"renderHugoPartials requires at least one request",
		);
		expect(parsed.frames).toEqual([]);
		expect(parsed.call).toBeUndefined();
		expect(parsed.message).toBe(
			"renderHugoPartials requires at least one request",
		);
	});
});

describe("enhanceHugoError", () => {
	test("leads with the root cause and carries the env_client hint separately", () => {
		const error = enhanceHugoError(PETITE_DAHLIA_ERROR, "grid");
		expect(error.message).toBe(
			'Failed to render Hugo component "grid": GetRemote: Get "https://cdn.nddmed.com/pages/nycskyline.jpg": net/http: fetch() failed: TypeError: NetworkError when attempting to fetch resource.',
		);
		expect(error.hint).toBe(
			"The partial errored while rendering in the editor. If the code " +
				"should only run in the site build, guard it with " +
				"`{{ if not site.Params.env_client }}`, " +
				"or supply an editor-safe version via " +
				"`params.editable_regions.templates_overrides`.",
		);
	});

	test("replaces the JS stack with the template callstack, innermost first", () => {
		const error = enhanceHugoError(PETITE_DAHLIA_ERROR, "grid");
		expect(error.stack).toBe(
			[
				"    at _partials/img.html:63:41",
				"    at _shortcodes/figure.html:28:7",
				"    at _partials/bookshop/components/grid/grid.hugo.html:45:131",
				"    at _partials/_bookshop/helpers/component.html:34:3",
				"    at _partials/bookshop.html:55:8",
				"    at __cc-dispatch.html:14:58",
			].join("\n"),
		);
	});

	test("non-template errors keep their JS stack", () => {
		const error = enhanceHugoError("something broke", "grid");
		expect(error.message).toBe(
			'Failed to render Hugo component "grid": something broke.',
		);
		expect(error.stack).toContain("at enhanceHugoError");
		expect(error.hint).toBeUndefined();
	});

	test("the missing-partial hint still applies", () => {
		const error = enhanceHugoError('partial "nope" not found', "nope");
		expect(error.hint).toContain(
			"This partial isn't in the bundled template snapshot.",
		);
	});
});
