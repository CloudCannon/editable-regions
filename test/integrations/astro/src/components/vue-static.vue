<script setup>
const props = defineProps({
	title: { type: String, default: "Vue Static" },
});
</script>

<template>
  <div class="vue-static">
    <h2>{{ title }}</h2>
    <p>This is a static Vue component with no client interactivity.</p>
  </div>
</template>
