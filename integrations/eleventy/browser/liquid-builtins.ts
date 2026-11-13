import sindresorhusSlugify from "@sindresorhus/slugify";
import type { Liquid } from "liquidjs";
import simovSlugify from "slugify";
import { warnOnce } from "../../liquid/logger.js";
import { getPageMap, normalizeInputPath } from "../../liquid/page-map.js";
import { createShortcodeTag } from "../../liquid/shortcodes.js";
import {
	createRenderContentFilter,
	createRenderFileShortcode,
	createRenderTemplateTag,
} from "./liquid-render.js";

export function logFilter(value: any, prefix = ""): any {
	if (prefix) {
		console.log(`[${prefix}]`, value);
	} else {
		console.log(value);
	}
	return value;
}

export function slugFilter(
	str: unknown,
	options: Record<string, any> = {},
): string {
	return simovSlugify(`${str}`, { replacement: "-", lower: true, ...options });
}

export function slugifyFilter(
	str: unknown,
	options: Record<string, any> = {},
): string {
	return sindresorhusSlugify(`${str}`, { decamelize: false, ...options });
}

/** Unlike upstream, a missing pathPrefix returns the input rather than throwing. */
export function urlFilter(url: string, pathPrefix = ""): string {
	if (!url) return "";

	const urlString = String(url);
	if (isAbsoluteUrl(urlString)) return urlString;
	if (urlString.startsWith("//") && urlString !== "//") return urlString;
	if (!pathPrefix) return urlString;

	const normalizedPrefix = `/${pathPrefix.replace(/^\/+|\/+$/g, "")}`;
	if (urlString.startsWith("/")) return `${normalizedPrefix}${urlString}`;

	return urlString;
}

function isAbsoluteUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function toDate(value: any): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (value === null || value === undefined || value === "") return null;

	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function dateToRfc3339(date: Date | string | number): string {
	const d = toDate(date);

	return d ? d.toISOString() : "";
}

export function dateToRfc822(date: Date | string | number): string {
	const d = toDate(date);

	return d ? d.toUTCString() : "";
}

export function htmlDateString(date: Date | string | number): string {
	const d = toDate(date);

	return d ? d.toISOString().slice(0, 10) : "";
}

export function getNewestCollectionItemDate(
	collection: Array<{ date?: any }>,
	emptyFallback?: Date | string | number,
): Date {
	if (!Array.isArray(collection) || collection.length === 0) {
		return toDate(emptyFallback) ?? new Date(0);
	}

	let newest = 0;
	for (const item of collection) {
		const d = toDate(item?.date);
		if (d && d.getTime() > newest) newest = d.getTime();
	}

	return newest ? new Date(newest) : (toDate(emptyFallback) ?? new Date(0));
}

/** `await` works for both the Promise-returning `page` proxy and a plain string. */
async function indexInCollection(
	collection: Array<{ inputPath?: string }>,
	page: any,
): Promise<number> {
	if (!Array.isArray(collection)) return -1;

	if (!page) {
		warnOnce(
			"collection-item-no-page",
			"Eleventy collection-item filter called without a `page` argument. " +
				"In live editing, pass the page/item explicitly (e.g. `collections.posts | getCollectionItem: page`).",
		);

		return -1;
	}

	const inputPath = await page.inputPath;
	if (typeof inputPath !== "string" || !inputPath) return -1;

	return collection.findIndex((item) => item?.inputPath === inputPath);
}

export async function getCollectionItem(
	collection: any[],
	page: any,
): Promise<any> {
	const i = await indexInCollection(collection, page);

	return i >= 0 ? collection[i] : undefined;
}

export async function getPreviousCollectionItem(
	collection: any[],
	page: any,
): Promise<any> {
	const i = await indexInCollection(collection, page);

	return i > 0 ? collection[i - 1] : undefined;
}

export async function getNextCollectionItem(
	collection: any[],
	page: any,
): Promise<any> {
	const i = await indexInCollection(collection, page);

	return i >= 0 && i < collection.length - 1 ? collection[i + 1] : undefined;
}

export async function getCollectionItemIndex(
	collection: any[],
	page: any,
): Promise<number> {
	return indexInCollection(collection, page);
}

function passThroughStub(
	filterName: string,
	reason: string,
): (value: any) => any {
	return (value: any) => {
		warnOnce(
			`filter-stub:${filterName}`,
			`Eleventy filter "${filterName}" is not supported in live editing (${reason}). ` +
				"Returning the input unchanged.",
		);

		return value;
	};
}

export function inputPathToUrlFilter(inputPath: unknown): string {
	if (typeof inputPath !== "string" || !inputPath) {
		return typeof inputPath === "string" ? inputPath : "";
	}

	const entry = getPageMap()[normalizeInputPath(inputPath)];
	if (entry?.url) return entry.url;

	warnOnce(
		`input-path-to-url-miss:${inputPath}`,
		`inputPathToUrl: no build-time URL recorded for "${inputPath}". ` +
			"This usually means the file wasn't in the last build. Returning the " +
			"input unchanged.",
	);

	return inputPath;
}

export const eleventyFilters = {
	slug: slugFilter,
	slugify: slugifyFilter,
	log: logFilter,
	url: urlFilter,
	dateToRfc3339,
	dateToRfc822,
	htmlDateString,
	getNewestCollectionItemDate,
	getCollectionItem,
	getPreviousCollectionItem,
	getNextCollectionItem,
	getCollectionItemIndex,
	inputPathToUrl: inputPathToUrlFilter,
	htmlBaseUrl: passThroughStub(
		"htmlBaseUrl",
		"it requires Eleventy's pathPrefix/HTML base config",
	),
	serverlessUrl: passThroughStub(
		"serverlessUrl",
		"serverless routing is a build-time concept",
	),
};

export const builtinFilterNames: string[] = [
	...Object.keys(eleventyFilters),
	"renderContent",
];

export const builtinShortcodeNames: string[] = ["renderFile"];

export function registerEleventyBuiltins(liquidEngine: Liquid): void {
	for (const [name, fn] of Object.entries(eleventyFilters)) {
		liquidEngine.registerFilter(name, fn);
	}

	liquidEngine.registerTag(
		"renderTemplate",
		createRenderTemplateTag(liquidEngine),
	);

	liquidEngine.registerTag(
		"renderFile",
		createShortcodeTag("renderFile", createRenderFileShortcode(liquidEngine)),
	);

	liquidEngine.registerFilter(
		"renderContent",
		createRenderContentFilter(liquidEngine),
	);
}
