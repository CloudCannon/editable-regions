/**
 * Browser-side shims for Eleventy's RenderPlugin
 * (https://v3.11ty.dev/docs/plugins/render/). Upstream registers
 * `renderTemplate` (paired Liquid tag), `renderContent` (async filter), and
 * `renderFile` (async shortcode). All three compile a body as `templateLang`
 * and render it with `data`. In the browser we only have LiquidJS, so:
 *   - "liquid" (or unspecified) → real parse-and-render via the shared engine
 *   - "html" → identity passthrough
 *   - any other engine → warn-once and return the body unchanged
 */

import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { warnOnce } from "../../liquid/logger.mjs";
import { evaluateArgs, parseArgs } from "../../liquid/shortcodes.mjs";

const supportedEngines = new Set(["liquid", "html"]);

/**
 * Liquid tag factory for `{% renderTemplate ... %}…{% endrenderTemplate %}`.
 * Captures the inner content as raw template source (matching upstream — the
 * body is compiled in the requested engine, not pre-rendered by the outer
 * scope) and renders it against `data` via the shared engine.
 *
 * @param {any} _liquidEngine - Unused; reached via `this.liquid`
 * @returns {any}
 */
export function createRenderTemplateTag(_liquidEngine) {
	return {
		parse(/** @type {any} */ tagToken, /** @type {any[]} */ remainTokens) {
			this.name = tagToken.name;
			this.argTokens = parseArgs(
				tagToken.args,
				this.liquid.options.operatorsTrie,
			);
			this.bodyTokens = [];

			const endTagName = `end${this.name}`;
			while (remainTokens.length) {
				const token = remainTokens.shift();
				if (token.name === endTagName) return;

				this.bodyTokens.push(token);
			}

			throw new Error(`tag ${this.name} not closed`);
		},

		async render(/** @type {any} */ context) {
			const args = await evaluateArgs(this.argTokens, context);
			const { templateLang, data } = normalizeRenderArgs([args[0], args[1]]);
			const body = this.bodyTokens
				.map((/** @type {any} */ t) => t.getText())
				.join("");

			if (templateLang && !supportedEngines.has(templateLang)) {
				warnOnce(
					`render-template:${templateLang}`,
					unsupportedEngineMessage(templateLang),
				);
				return body;
			}

			if (templateLang === "html") return body;
			return await this.liquid.parseAndRender(body, data);
		},
	};
}

/**
 * Builds the `renderContent` filter, capturing the shared engine so we can
 * call `parseAndRender` against it at filter time.
 *
 * @param {any} liquidEngine
 */
export function createRenderContentFilter(liquidEngine) {
	return async function renderContent(
		/** @type {any} */ content,
		/** @type {any} */ templateLang,
		/** @type {any} */ data,
	) {
		const normalized = normalizeRenderArgs([templateLang, data]);
		const body = content == null ? "" : String(content);

		if (
			normalized.templateLang &&
			!supportedEngines.has(normalized.templateLang)
		) {
			warnOnce(
				`render-content:${normalized.templateLang}`,
				unsupportedEngineMessage(normalized.templateLang),
			);

			return body;
		}

		if (normalized.templateLang === "html") return body;

		return await liquidEngine.parseAndRender(body, normalized.data);
	};
}

/**
 * Builds the `renderFile` shortcode. Fetches `inputPath` via the CloudCannon
 * Visual Editor API (`CloudCannon.file(path).content.get()`) and renders the
 * body with `data`. The engine is taken from `templateLang` when supplied,
 * otherwise inferred from the file extension.
 *
 * @param {any} liquidEngine
 */
export function createRenderFileShortcode(liquidEngine) {
	return async function renderFile(
		/** @type {any} */ inputPath,
		/** @type {any} */ data,
		/** @type {any} */ templateLang,
	) {
		if (typeof inputPath !== "string" || !inputPath) {
			warnOnce(
				"render-file:no-path",
				"renderFile: missing or non-string path argument. Returning empty.",
			);

			return "";
		}

		// Normalise Eleventy-style paths (`./foo`, `/foo`) to the
		// project-relative shape the CC API expects.
		const normalizedPath = inputPath.replace(/^\.\/+/, "").replace(/^\/+/, "");

		await apiLoadedPromise;

		const file = CloudCannon?.file?.(normalizedPath);
		if (!file) {
			warnOnce(
				`render-file-missing:${inputPath}`,
				`renderFile: CloudCannon API not available; cannot load "${inputPath}".`,
			);
			return "";
		}

		// Fetch the file's own front matter alongside its body to mirror 11ty's
		// data cascade: the file's data is the base, the caller's `data` arg
		// overrides on top. `content.get()` strips front matter, matching 11ty.
		let body;
		let frontMatter;

		try {
			[body, frontMatter] = await Promise.all([
				file.content.get(),
				file.data.get(),
			]);
		} catch (err) {
			warnOnce(
				`render-file-missing:${inputPath}`,
				`renderFile: failed to load "${inputPath}" via the CloudCannon API ` +
					`(${err instanceof Error ? err.message : String(err)}).`,
			);

			return "";
		}

		const engine =
			(typeof templateLang === "string" && templateLang) ||
			inferEngineFromPath(inputPath);

		if (engine && !supportedEngines.has(engine)) {
			warnOnce(`render-file:${engine}`, unsupportedEngineMessage(engine));

			return body;
		}

		if (engine === "html") return body;

		const mergedData = { ...(frontMatter ?? {}), ...(data ?? {}) };

		return await liquidEngine.parseAndRender(body, mergedData);
	};
}

/**
 * Normalises the `(templateLang, data)` argument pair, supporting both the
 * documented `(content, lang, data)` shape and the `(content, data)` overload
 * where the lang is omitted and the second positional is treated as data.
 *
 * @param {[any, any]} args
 * @returns {{templateLang: string | undefined, data: any}}
 */
function normalizeRenderArgs([templateLang, data]) {
	if (templateLang && typeof templateLang !== "string") {
		data = templateLang;
		templateLang = undefined;
	}

	return { templateLang, data: data ?? {} };
}

/**
 * Anything not in the supported set still gets a guess so the warn-once
 * message can name the engine — but only "liquid" / "html" actually render;
 * the rest fall through to passthrough.
 *
 * @param {string} inputPath
 */
function inferEngineFromPath(inputPath) {
	const dot = inputPath.lastIndexOf(".");
	if (dot < 0) return undefined;

	const ext = inputPath.slice(dot + 1).toLowerCase();
	if (ext === "liquid") return "liquid";
	if (ext === "html" || ext === "htm") return "html";
	if (ext === "md") return "md";
	if (ext === "njk") return "njk";
	return undefined;
}

function unsupportedEngineMessage(/** @type {string} */ engineName) {
	return (
		`Eleventy RenderPlugin: engine "${engineName}" is not supported in ` +
		`live editing (only "liquid" and "html" run in the browser). ` +
		"Returning the body unchanged."
	);
}
