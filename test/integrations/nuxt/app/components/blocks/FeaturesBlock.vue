<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		items?: { title?: string; description?: string }[];
	}>(),
	{ heading: "", items: () => [] },
);
</script>

<template>
	<div class="block block--features">
		<h2>
			<editable-text data-prop="heading">{{ heading }}</editable-text>
		</h2>

		<div class="grid" data-editable="array" data-prop="items">
			<div
				v-for="item in items"
				:key="item.title"
				class="card"
				data-editable="array-item"
			>
				<h3 data-editable="text" data-prop="title">{{ item.title }}</h3>
				<p data-editable="text" data-prop="description">
					{{ item.description }}
				</p>
			</div>
		</div>
	</div>
</template>
