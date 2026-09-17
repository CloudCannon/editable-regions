<script setup lang="ts">
import { getPage } from "../utils/content";

const page = getPage("image");

useHead({ title: `${page.data.title} — Vue harness` });
</script>

<template>
	<div>
		<h1 data-editable="text" data-type="span" data-prop="title">
			{{ page.data.title }}
		</h1>

		<section class="test-section">
			<h2>Region host is the &lt;img&gt;</h2>
			<p class="note">
				data-editable="image" with data-prop-src and data-prop-alt on the img
				itself. Each facet binds to its own frontmatter field.
			</p>
			<img
				v-if="page.data.hero_src"
				data-editable="image"
				data-prop-src="hero_src"
				data-prop-alt="hero_alt"
				:src="page.data.hero_src"
				:alt="page.data.hero_alt"
				width="480"
				height="320"
			/>
		</section>

		<section class="test-section">
			<h2>Region host wraps the &lt;img&gt;</h2>
			<p class="note">
				&lt;editable-image&gt; wrapper around a plain img. The descendant img is
				what receives live src/alt updates.
			</p>
			<editable-image
				v-if="page.data.wrapped?.src"
				data-prop-src="wrapped.src"
				data-prop-alt="wrapped.alt"
			>
				<img
					:src="page.data.wrapped.src"
					:alt="page.data.wrapped.alt"
					width="480"
					height="320"
				/>
			</editable-image>
		</section>

		<section class="test-section">
			<h2>Bound to a whole image object</h2>
			<p class="note">
				A single data-prop, because the stored value is already one object the
				editor understands.
			</p>
			<editable-image v-if="page.data.portrait?.src" data-prop="portrait">
				<img
					:src="page.data.portrait.src"
					:alt="page.data.portrait.alt"
					:title="page.data.portrait.title"
					width="480"
					height="320"
				/>
			</editable-image>
		</section>
	</div>
</template>
