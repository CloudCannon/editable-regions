<script>
let { title = "Svelte Slotted", children } = $props();
</script>

<div class="svelte-slotted">
  <h2>{title}</h2>
  {@render children?.()}
</div>
