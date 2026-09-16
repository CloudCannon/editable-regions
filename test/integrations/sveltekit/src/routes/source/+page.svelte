<svelte:head>
	<title>Source editable regions — SvelteKit harness</title>
</svelte:head>

<!--
	Source regions splice edited content back into this file, located by data-key.
	Everything inside a source region must therefore be plain static markup — no
	expressions, directives, or child components. data-path is repo-root-relative.
-->
<div>
	<h1
		data-editable="source"
		data-path="test/integrations/sveltekit/src/routes/source/+page.svelte"
		data-key="source-page-title"
		data-type="span"
	>
		Source editable regions
	</h1>

	<section class="test-section">
		<h2>Long-form prose, pinned to the template</h2>
		<p class="note">
			No content file and no frontmatter — these regions read and write
			src/routes/source/+page.svelte itself.
		</p>

		<div
			data-editable="source"
			data-path="test/integrations/sveltekit/src/routes/source/+page.svelte"
			data-key="source-page-body"
			data-type="block"
		>
			<p>
				This paragraph lives in the Svelte single-file component rather than in
				a content file. CloudCannon reads the whole file, finds this element by
				its data-key, replaces the markup inside it, and writes the file back.
			</p>
			<p>
				Source regions are the exception, not the default. A page with two or
				more structured sections belongs in a collection or a page builder —
				this one exists only to find out whether the round trip survives a
				.svelte file at all.
			</p>
		</div>
	</section>

	<section class="test-section">
		<h2>A second region in the same file</h2>
		<p class="note">
			data-key must be unique within the file, or the splice targets the wrong
			element.
		</p>

		<p
			data-editable="source"
			data-path="test/integrations/sveltekit/src/routes/source/+page.svelte"
			data-key="source-page-footnote"
			data-type="text"
		>
			Editing this line should leave the paragraphs above untouched.
		</p>
	</section>
</div>
