export const metadata = {
	title: "Source editable regions — Next.js harness",
};

/*
	Source regions splice their new content straight back into this file,
	located by their data-key. Everything inside a source region must therefore
	be plain static markup: no JSX expressions, no child components. Any of
	those would be destroyed by the first edit.

	data-path is relative to the repo root, not to this file.
*/
export default function SourcePage() {
	return (
		<div>
			<h1
				data-editable="source"
				data-path="test/integrations/nextjs/app/source/page.tsx"
				data-key="source-page-title"
				data-type="span"
			>
				Source editable regions
			</h1>

			<section className="test-section">
				<h2>Long-form prose, pinned to the template</h2>
				<p className="note">
					No content file and no frontmatter — these regions read and write
					app/source/page.tsx itself.
				</p>

				<div
					data-editable="source"
					data-path="test/integrations/nextjs/app/source/page.tsx"
					data-key="source-page-body"
					data-type="block"
				>
					<p>
						This paragraph lives in the TSX route file rather than in a content
						file. CloudCannon reads the whole file, finds this element by its
						data-key, replaces the markup inside it, and writes the file back.
					</p>
					<p>
						Source regions are the exception, not the default. A page with two
						or more structured sections belongs in a collection or a page
						builder — this one exists only to find out whether the round trip
						survives a .tsx file at all.
					</p>
				</div>
			</section>

			<section className="test-section">
				<h2>A second region in the same file</h2>
				<p className="note">
					data-key must be unique within the file, or the splice targets the
					wrong element.
				</p>

				<p
					data-editable="source"
					data-path="test/integrations/nextjs/app/source/page.tsx"
					data-key="source-page-footnote"
					data-type="text"
				>
					Editing this line should leave the paragraphs above untouched.
				</p>
			</section>
		</div>
	);
}
