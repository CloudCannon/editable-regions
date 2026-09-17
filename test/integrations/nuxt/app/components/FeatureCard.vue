<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		title?: string;
		description?: string;
		badge?: string;
		highlighted?: boolean;
		items?: string[];
	}>(),
	{
		title: "",
		description: "",
		badge: "",
		highlighted: false,
		items: () => [],
	},
);

const footnote = computed(() =>
	props.items.length === 1 ? "1 item" : `${props.items.length} items`,
);
</script>

<template>
	<div
		class="card"
		:style="highlighted ? 'border-color: var(--accent); border-width: 2px' : ''"
	>
		<p v-if="badge?.trim()">
			<em><editable-text data-prop="badge">{{ badge }}</editable-text></em>
		</p>

		<h3>
			<editable-text data-prop="title">{{ title }}</editable-text>
		</h3>

		<p>
			<editable-text data-prop="description">{{ description }}</editable-text>
		</p>

		<ul data-editable="array" data-prop="items">
			<li v-for="item in items" :key="item" data-editable="array-item">
				<editable-text data-prop="">{{ item }}</editable-text>
			</li>
		</ul>

		<small>{{ footnote }}</small>
	</div>
</template>
