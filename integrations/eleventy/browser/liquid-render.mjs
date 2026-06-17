/**
 * Browser shims for Eleventy's RenderPlugin
 * (https://v3.11ty.dev/docs/plugins/render/): `renderTemplate` (paired tag),
 * `renderContent` (filter), `renderFile` (shortcode). Each compiles a body as
 * `templateLang` and renders it with `data`. Only LiquidJS runs in the browser,
 * so: "liquid"/unspecified → real render; "html" → passthrough; else →
 * warn-once and return the body unchanged.
 */

import {
	apiLoadedPromise,
	CloudCannon,
} from "../../../helpers/cloudcannon.mjs";
import { warnOnce } from "../../liquid/logger.mjs";
import { evaluateArgs, parseArgs } from "../../liquid/shortcodes.mjs";

const supportedEngines = new Set(["liquid", "html"]);

/**
 * Tag factory for `{% renderTemplate ... %}…{% endrenderTemplate %}`. Captures
 * the body as raw source (matching upstream — compiled in the requested engine,
 * not pre-rendered) and renders it against `data`.
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
 * Builds the `renderContent` filter, capturing the shared engine.
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
 * API and renders its body with `data`. Engine comes from `templateLang`, else
 * inferred from the file extension.
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

		// Mirror 11ty's data cascade: the file's own front matter is the base,
		// the caller's `data` arg overrides on top. `content.get()` strips it.
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
 * Normalises the `(templateLang, data)` pair, supporting the `(lang, data)`
 * and lang-omitted `(data)` overloads.
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
 * Guesses the engine from the extension so the warn-once message can name it;
 * only "liquid"/"html" actually render, the rest fall through to passthrough.
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
