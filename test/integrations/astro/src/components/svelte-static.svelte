<script>
  let { title = "Svelte Static" } = $props();
</script>

<div class="svelte-static">
  <h2>{title}</h2>
  <p>This is a static Svelte component with no client interactivity.</p>
</div>
