<script setup lang="ts">
import {
	getPage,
	renderInlineMarkdown,
	renderMarkdown,
} from "../utils/content";

const page = getPage("text");

useHead({ title: `${page.data.title} — Vue harness` });
</script>

<template>
	<div>
		<section class="test-section">
			<h2>data-type="span"</h2>
			<p class="note">Plain text, no formatting toolbar.</p>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{{ page.data.title }}
			</h1>
		</section>

		<section class="test-section">
			<h2>data-type="text"</h2>
			<p class="note">Paragraph-level rich text: bold, links, superscript.</p>
			<p
				data-editable="text"
				data-type="text"
				data-prop="standfirst"
				v-html="renderInlineMarkdown(page.data.standfirst)"
			/>
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
				v-html="renderMarkdown(page.data.intro)"
			/>
		</section>

		<section class="test-section">
			<h2>data-prop="@content"</h2>
			<p class="note">The markdown body of content/pages/text.md.</p>
			<!-- eslint-disable-next-line vue/no-v-html -->
			<div
				data-editable="text"
				data-type="block"
				data-prop="@content"
				v-html="page.html"
			/>
		</section>
	</div>
</template>
