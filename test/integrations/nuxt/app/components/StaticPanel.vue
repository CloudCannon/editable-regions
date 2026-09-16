<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		body?: string;
	}>(),
	{ heading: "", body: "" },
);
</script>

<template>
	<div class="card">
		<h3>
			<editable-text data-prop="heading">{{ heading }}</editable-text>
		</h3>
		<p>
			<editable-text data-prop="body">{{ body }}</editable-text>
		</p>
	</div>
</template>
