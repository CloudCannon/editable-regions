import type { Liquid } from "liquidjs";
import { apiLoadedPromise, CloudCannon } from "../../../helpers/cloudcannon.js";
import { warnOnce } from "../../liquid/logger.js";
import { evaluateArgs, parseArgs } from "../../liquid/shortcodes.js";
import type { LiquidTagImpl } from "../../liquid/tag-types.js";

const supportedEngines = new Set(["liquid", "html"]);

/** Keeps the body raw so it compiles in the requested engine. */
export function createRenderTemplateTag(_liquidEngine: Liquid): LiquidTagImpl {
	return {
		parse(tagToken, remainTokens) {
			this.name = tagToken.name;
			this.argTokens = parseArgs(tagToken.args, this.liquid.options.operators);
			this.bodyTokens = [];

			const endTagName = `end${this.name}`;
			while (remainTokens.length) {
				const token = remainTokens.shift() as any;
				if (token.name === endTagName) return;

				this.bodyTokens.push(token);
			}

			throw new Error(`tag ${this.name} not closed`);
		},

		async render(context) {
			const args = await evaluateArgs(this.argTokens, context);
			const { templateLang, data } = normalizeRenderArgs([args[0], args[1]]);
			const body = this.bodyTokens.map((t: any) => t.getText()).join("");

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

export function createRenderContentFilter(
	liquidEngine: Liquid,
): (content: any, templateLang: any, data: any) => Promise<string | undefined> {
	return async function renderContent(
		content: any,
		templateLang: any,
		data: any,
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

export function createRenderFileShortcode(
	liquidEngine: Liquid,
): (
	inputPath: any,
	data: any,
	templateLang: any,
) => Promise<string | undefined> {
	return async function renderFile(
		inputPath: any,
		data: any,
		templateLang: any,
	) {
		if (typeof inputPath !== "string" || !inputPath) {
			warnOnce(
				"render-file:no-path",
				"renderFile: missing or non-string path argument. Returning empty.",
			);

			return "";
		}

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

		// Data cascade: front matter first, the caller's `data` over it.
		let body: string | undefined;
		let frontMatter: Record<string, any> | any[] | undefined;

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

		return await liquidEngine.parseAndRender(body as string, mergedData);
	};
}

function normalizeRenderArgs([templateLang, data]: [any, any]): {
	templateLang: string | undefined;
	data: any;
} {
	if (templateLang && typeof templateLang !== "string") {
		data = templateLang;
		templateLang = undefined;
	}

	return { templateLang, data: data ?? {} };
}

function inferEngineFromPath(inputPath: string): string | undefined {
	const dot = inputPath.lastIndexOf(".");
	if (dot < 0) return undefined;

	const ext = inputPath.slice(dot + 1).toLowerCase();
	if (ext === "liquid") return "liquid";
	if (ext === "html" || ext === "htm") return "html";
	if (ext === "md") return "md";
	if (ext === "njk") return "njk";
	return undefined;
}

function unsupportedEngineMessage(engineName: string): string {
	return (
		`Eleventy RenderPlugin: engine "${engineName}" is not supported in ` +
		`live editing (only "liquid" and "html" run in the browser). ` +
		"Returning the body unchanged."
	);
}
