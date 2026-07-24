<script setup>
import { ref } from "vue";

const props = defineProps({
	label: { type: String, default: "Vue Counter" },
});

const count = ref(0);
</script>

<template>
  <div class="vue-counter">
    <h2>{{ label }}</h2>
    <p>Count: {{ count }}</p>
    <button @click="count++">Increment</button>
  </div>
</template>
