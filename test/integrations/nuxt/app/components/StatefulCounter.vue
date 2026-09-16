<script setup lang="ts">
/**
 * registerVueComponent builds a fresh createApp on every re-render, so
 * component-local state resets each time CloudCannon pushes new data.
 */
const props = withDefaults(
	defineProps<{
		label?: string;
		step?: number;
	}>(),
	{ label: "", step: 1 },
);

const count = ref(0);
</script>

<template>
	<div class="card">
		<h3>
			<editable-text data-prop="label">{{ label }}</editable-text>
		</h3>
		<p>Count: <span class="count">{{ count }}</span></p>
		<button type="button" class="increment" @click="count += props.step">
			Add {{ props.step }}
		</button>
	</div>
</template>
