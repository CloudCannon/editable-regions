<script>
  let { label = "Svelte Counter" } = $props();
  let count = $state(0);
</script>

<div class="svelte-counter">
  <h2>{label}</h2>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
</div>
