<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		subheading?: string;
		image?: string;
		image_alt?: string;
	}>(),
	{ heading: "", subheading: "", image: "", image_alt: "" },
);
</script>

<template>
	<div class="block block--hero">
		<h2>
			<editable-text data-prop="heading">{{ heading }}</editable-text>
		</h2>
		<p>
			<editable-text data-prop="subheading">{{ subheading }}</editable-text>
		</p>
		<editable-image v-if="image" data-prop-src="image" data-prop-alt="image_alt">
			<img :src="image" :alt="image_alt" width="480" height="320" />
		</editable-image>
	</div>
</template>
