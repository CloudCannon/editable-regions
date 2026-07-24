<script setup>
const props = defineProps({
	title: { type: String, default: "Vue Static" },
});
</script>

<template>
  <div class="vue-static">
    <h2>{{ title }}</h2>
    <p>Static Vue component inside Astro</p>
  </div>
</template>
