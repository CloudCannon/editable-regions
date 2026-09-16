import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

/**
 * Markdown collection loader for `content/pages/*.md`.
 *
 * Hand-rolled rather than `gray-matter`: the parsed result is bundled into the
 * client for hydration, and gray-matter depends on Node's `Buffer`. `js-yaml`
 * runs in the browser.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const md = new MarkdownIt({ html: true, linkify: true });

const sources = import.meta.glob("../../content/pages/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

export interface PageEntry {
	slug: string;
	data: Record<string, any>;
	body: string;
	html: string;
}

function parse(slug: string, raw: string): PageEntry {
	const match = raw.match(FRONTMATTER);

	if (!match) {
		return { slug, data: {}, body: raw, html: md.render(raw) };
	}

	const data = (yaml.load(match[1] ?? "") ?? {}) as Record<string, any>;
	const body = match[2] ?? "";

	return { slug, data, body, html: md.render(body) };
}

const pages: Record<string, PageEntry> = Object.fromEntries(
	Object.entries(sources).map(([path, raw]) => {
		const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
		return [slug, parse(slug, raw)];
	}),
);

/**
 * Throws at build time when a page references a content file that doesn't exist
 * — better a failed prerender than a page silently rendering empty editable
 * regions.
 */
export function getPage(slug: string): PageEntry {
	const page = pages[slug];

	if (!page) {
		throw new Error(
			`No content file for "${slug}". Expected content/pages/${slug}.md`,
		);
	}

	return page;
}

export function getPages(): PageEntry[] {
	return Object.values(pages).sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Block regions (`data-type="block"`) must paint rendered markdown, not source —
 * the editor shows the stored value rendered, so an unrendered field looks like
 * it changed the moment it's focused.
 */
export function renderMarkdown(value?: string): string {
	return value ? md.render(value) : "";
}

/** Same, for `data-type="text"` regions, which are paragraph-level. */
export function renderInlineMarkdown(value?: string): string {
	return value ? md.renderInline(value) : "";
}
