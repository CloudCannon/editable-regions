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
    <p class="count">Count: {{ count }}</p>
    <button type="button" class="increment" @click="count++">Increment</button>
  </div>
</template>
