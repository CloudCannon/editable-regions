import {
	getPage,
	renderInlineMarkdown,
	renderMarkdown,
} from "../utils/content";

const page = getPage("text");

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function TextPage() {
	return (
		<div>
			<section className="test-section">
				<h2>data-type="span"</h2>
				<p className="note">Plain text, no formatting toolbar.</p>
				<h1 data-editable="text" data-type="span" data-prop="title">
					{page.data.title}
				</h1>
			</section>

			<section className="test-section">
				<h2>data-type="text"</h2>
				<p className="note">
					Paragraph-level rich text: bold, links, superscript.
				</p>
				<p
					data-editable="text"
					data-type="text"
					data-prop="standfirst"
					dangerouslySetInnerHTML={{
						__html: renderInlineMarkdown(page.data.standfirst),
					}}
				/>
			</section>

			<section className="test-section">
				<h2>data-type="block"</h2>
				<p className="note">
					Multi-paragraph rich text. The host is a div, not a p — a block editor
					can't live inside a paragraph.
				</p>
				<div
					data-editable="text"
					data-type="block"
					data-prop="intro"
					dangerouslySetInnerHTML={{ __html: renderMarkdown(page.data.intro) }}
				/>
			</section>

			<section className="test-section">
				<h2>data-prop="@content"</h2>
				<p className="note">The markdown body of content/pages/text.md.</p>
				<div
					data-editable="text"
					data-type="block"
					data-prop="@content"
					dangerouslySetInnerHTML={{ __html: page.html }}
				/>
			</section>
		</div>
	);
}
