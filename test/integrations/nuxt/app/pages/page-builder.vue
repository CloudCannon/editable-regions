<script setup lang="ts">
import { blockMap } from "../cloudcannon/componentMap";
import { getPage } from "../utils/content";

const page = getPage("page-builder");

const blocks = computed(() =>
	(page.data.content_blocks ?? []).filter(
		(block: { _type?: string }) => block._type && blockMap[block._type],
	),
);

useHead({ title: `${page.data.title} — Vue harness` });
</script>

<template>
	<div>
		<h1 data-editable="text" data-type="span" data-prop="title">
			{{ page.data.title }}
		</h1>

		<section class="test-section">
			<h2>content_blocks</h2>
			<p class="note">
				Three layers on every block: the array wrapper names the field that picks
				a component, each row is both an array-item and a component, and every
				visible field inside a block has its own region.
			</p>

			<!-- data-id-key is omitted — it defaults to data-component-key, and _type identifies each row. -->
			<div
				data-editable="array"
				data-prop="content_blocks"
				data-component-key="_type"
			>
				<div
					v-for="(block, index) in blocks"
					:key="`${block._type}-${index}`"
					data-editable="array-item"
					:data-component="block._type"
				>
					<component :is="blockMap[block._type]" v-bind="block" />
				</div>
			</div>
		</section>
	</div>
</template>
