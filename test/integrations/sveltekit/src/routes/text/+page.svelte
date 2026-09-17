<script>
	import {
		getPage,
		renderInlineMarkdown,
		renderMarkdown,
	} from "$lib/content";

	const page = getPage("text");
</script>

<svelte:head>
	<title>{page.data.title} — SvelteKit harness</title>
</svelte:head>

<div>
	<section class="test-section">
		<h2>data-type="span"</h2>
		<p class="note">Plain text, no formatting toolbar.</p>
		<h1 data-editable="text" data-type="span" data-prop="title">
			{page.data.title}
		</h1>
	</section>

	<section class="test-section">
		<h2>data-type="text"</h2>
		<p class="note">Paragraph-level rich text: bold, links, superscript.</p>
		<p
			data-editable="text"
			data-type="text"
			data-prop="standfirst"
		>
			{@html renderInlineMarkdown(page.data.standfirst)}
		</p>
	</section>

	<section class="test-section">
		<h2>data-type="block"</h2>
		<p class="note">
			Multi-paragraph rich text. The host is a div, not a p — a block editor
			can't live inside a paragraph.
		</p>
		<div
			data-editable="text"
			data-type="block"
			data-prop="intro"
		>
			{@html renderMarkdown(page.data.intro)}
		</div>
	</section>

	<section class="test-section">
		<h2>data-prop="@content"</h2>
		<p class="note">The markdown body of content/pages/text.md.</p>
		<div data-editable="text" data-type="block" data-prop="@content">
			{@html page.html}
		</div>
	</section>
</div>
