import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

/**
 * Markdown collection loader for `content/pages/*.md`.
 *
 * Deliberately hand-rolled rather than using `gray-matter`: the parsed result
 * is handed straight to React's SSR, and gray-matter depends on Node's
 * `Buffer`. `js-yaml` has no such dependency.
 *
 * Reads the directory with node:fs; every caller is a server component
 * evaluated at build time, so the filesystem is only touched while
 * prerendering.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const md = new MarkdownIt({ html: true, linkify: true });

const sources: Record<string, string> = Object.fromEntries(
	readdirSync(path.join(process.cwd(), "content", "pages"))
		.filter((file) => file.endsWith(".md"))
		.map((file) => [
			file,
			readFileSync(path.join(process.cwd(), "content", "pages", file), "utf8"),
		]),
);

export interface PageEntry {
	/** Filename without extension — matches the route and the CC `[slug]` URL. */
	slug: string;
	/** Parsed frontmatter. */
	data: Record<string, any>;
	/** Raw markdown body. */
	body: string;
	/** Body rendered to HTML, for `data-prop="@content"` regions. */
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
	Object.entries(sources).map(([file, raw]) => {
		const slug = file.replace(/\.md$/, "");
		return [slug, parse(slug, raw)];
	}),
);

/**
 * Returns the entry for a page slug. Throws at build time when a harness page
 * references a content file that doesn't exist — better a failed prerender than
 * a page that silently renders empty editable regions.
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
 * Renders a markdown frontmatter field to block-level HTML.
 *
 * Fields bound to `data-type="block"` regions must paint as rich text, not as
 * raw markdown source — the editor shows the stored value rendered, so an
 * unrendered field makes the region look like it changed the moment it's
 * focused.
 */
export function renderMarkdown(value?: string): string {
	return value ? md.render(value) : "";
}

/** Same, for `data-type="text"` regions, which are paragraph-level. */
export function renderInlineMarkdown(value?: string): string {
	return value ? md.renderInline(value) : "";
}
