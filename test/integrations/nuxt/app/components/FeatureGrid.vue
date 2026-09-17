<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		items?: {
			title?: string;
			description?: string;
			icon?: string;
			bullets?: string[];
		}[];
	}>(),
	{ heading: "", items: () => [] },
);
</script>

<template>
	<section class="section">
		<h2 data-editable="text" data-prop="heading">{{ heading }}</h2>

		<div class="grid" data-editable="array" data-prop="items">
			<div
				v-for="item in items"
				:key="item.title"
				class="card"
				data-editable="array-item"
			>
				<editable-image v-if="item.icon" data-prop-src="icon">
					<img :src="item.icon" :alt="item.title" width="240" height="160" />
				</editable-image>

				<h3 data-editable="text" data-prop="title">{{ item.title }}</h3>
				<p data-editable="text" data-prop="description">{{ item.description }}</p>

				<!-- Array inside an array item — paths stay relative to this row. -->
				<ul data-editable="array" data-prop="bullets">
					<li
						v-for="bullet in item.bullets"
						:key="bullet"
						data-editable="array-item"
					>
						<editable-text data-prop="">{{ bullet }}</editable-text>
					</li>
				</ul>
			</div>
		</div>
	</section>
</template>
