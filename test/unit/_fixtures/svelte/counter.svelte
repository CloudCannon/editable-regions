<script>
// Svelte component with a `count` prop — renders the value inline.
// Used by `svelte/render` to assert props pass through the wrapper.
let { count = 0 } = $props();
</script>

<p>count: {count}</p>
