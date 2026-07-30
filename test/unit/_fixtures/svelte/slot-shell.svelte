<script>
// Svelte component with a `children` snippet — renders a shell around it.
// Used by `svelte/slots` to assert that a component expecting a child
// renders its shell gracefully when no snippet content is provided.
let { children } = $props();
</script>

<div class="slot-shell">
	{@render children?.()}
</div>
