<template>
	<p class="greeting">Hello {{ name }}</p>
</template>

<script>
export default {
	name: "Greeting",
	props: {
		name: { type: String, default: "Vue 2" },
	},
};
</script>
