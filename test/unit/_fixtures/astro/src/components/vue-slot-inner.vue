<script setup>
const props = defineProps({
	title: { type: String, default: "Vue Slotted" },
});
</script>

<template>
  <div class="vue-slotted">
    <h2>{{ title }}</h2>
    <slot />
  </div>
</template>
