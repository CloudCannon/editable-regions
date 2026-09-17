<script setup lang="ts">
import { getPage } from "../utils/content";

const page = getPage("array");

/**
 * "Add item" blueprints, authored as HTML strings — see RawTemplate.vue for why
 * they can't be Vue markup. Each mirrors its live row exactly: same regions,
 * same relative paths, empty values, and a real <img> for the image region to
 * target.
 *
 * Blueprints live on this page only — every other array is non-empty at build
 * time, so the runtime clones its first row instead.
 */
const FEATURE_BLUEPRINT = `
	<div class="card" data-editable="array-item">
		<editable-image data-prop-src="icon"><img src="" alt="" width="240" height="160"></editable-image>
		<h3 data-editable="text" data-prop="title"></h3>
		<p data-editable="text" data-prop="description"></p>
	</div>
`;

const STRING_BLUEPRINT = `
	<li data-editable="array-item"><editable-text data-prop=""></editable-text></li>
`;

useHead({ title: `${page.data.title} — Vue harness` });
</script>

<template>
	<div>
		<h1 data-editable="text" data-type="span" data-prop="title">
			{{ page.data.title }}
		</h1>

		<section class="test-section">
			<h2>Array of objects</h2>
			<p class="note">
				Container carries data-prop; every row carries array-item; every visible
				field inside a row has its own region with a relative path.
			</p>

			<div class="grid" data-editable="array" data-prop="features">
				<div
					v-for="feature in page.data.features"
					:key="feature.title"
					class="card"
					data-editable="array-item"
				>
					<editable-image v-if="feature.icon" data-prop-src="icon">
						<img :src="feature.icon" :alt="feature.title" width="240" height="160" />
					</editable-image>
					<h3 data-editable="text" data-prop="title">{{ feature.title }}</h3>
					<p data-editable="text" data-prop="description">
						{{ feature.description }}
					</p>
				</div>

				<RawTemplate :html="FEATURE_BLUEPRINT" />
			</div>
		</section>

		<section class="test-section">
			<h2>Array of plain strings</h2>
			<p class="note">
				Rows are strings, not objects, so the inner region uses data-prop="" to
				take the current scope as its value.
			</p>

			<ul data-editable="array" data-prop="tags">
				<li v-for="tag in page.data.tags" :key="tag" data-editable="array-item">
					<editable-text data-prop="">{{ tag }}</editable-text>
				</li>

				<RawTemplate :html="STRING_BLUEPRINT" />
			</ul>
		</section>

		<section class="test-section">
			<h2>Empty array — blueprint is the only way to add a row</h2>
			<p class="note">
				empty_list is [] in frontmatter, so there is no first row for the runtime
				to clone. This is the case &lt;template&gt; blueprints exist for, and the
				only section here that genuinely depends on one.
			</p>

			<ul data-editable="array" data-prop="empty_list">
				<li
					v-for="entry in page.data.empty_list"
					:key="entry"
					data-editable="array-item"
				>
					<editable-text data-prop="">{{ entry }}</editable-text>
				</li>

				<RawTemplate :html="STRING_BLUEPRINT" />
			</ul>
		</section>
	</div>
</template>
