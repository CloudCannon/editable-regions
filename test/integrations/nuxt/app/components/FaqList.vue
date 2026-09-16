<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		items?: { question?: string; answer?: string }[];
	}>(),
	{ heading: "", items: () => [] },
);
</script>

<template>
	<section class="section">
		<h2 data-editable="text" data-prop="heading">{{ heading }}</h2>

		<div data-editable="array" data-prop="items">
			<details
				v-for="item in items"
				:key="item.question"
				class="card"
				data-editable="array-item"
			>
				<summary>
					<editable-text data-prop="question">{{ item.question }}</editable-text>
				</summary>
				<p data-editable="text" data-type="text" data-prop="answer">
					{{ item.answer }}
				</p>
			</details>
		</div>
	</section>
</template>
