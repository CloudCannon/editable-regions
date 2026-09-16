<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		description?: string;
		button_label?: string;
		button_url?: string;
		show_button?: boolean;
		theme?: "dark" | "light";
	}>(),
	{
		heading: "",
		description: "",
		button_label: "",
		button_url: "",
		show_button: false,
		theme: "dark",
	},
);
</script>

<template>
	<div class="cta" :class="`cta--${theme}`">
		<h2 v-if="heading">
			<editable-text data-prop="heading">{{ heading }}</editable-text>
		</h2>

		<p v-if="description">
			<editable-text data-prop="description" data-type="text">{{
				description
			}}</editable-text>
		</p>

		<a
			v-if="show_button && button_label?.trim()"
			class="cta__button"
			:href="button_url"
		>
			<editable-text data-prop="button_label">{{ button_label }}</editable-text>
		</a>
	</div>
</template>
