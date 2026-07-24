<script>
let { label = "Svelte Counter" } = $props();
let count = $state(0);
</script>

<div class="svelte-counter">
  <h2>{label}</h2>
  <p class="count">Count: {count}</p>
  <button type="button" class="increment" onclick={() => count++}>Increment</button>
</div>
