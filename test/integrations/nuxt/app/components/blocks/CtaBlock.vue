<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		button_label?: string;
		button_url?: string;
		theme?: "dark" | "light";
	}>(),
	{ heading: "", button_label: "", button_url: "", theme: "light" },
);
</script>

<template>
	<div class="block block--cta">
		<div class="cta" :class="`cta--${theme}`">
			<h2>
				<editable-text data-prop="heading">{{ heading }}</editable-text>
			</h2>
			<a v-if="button_label?.trim()" class="cta__button" :href="button_url">
				<editable-text data-prop="button_label">{{ button_label }}</editable-text>
			</a>
		</div>
	</div>
</template>
