<script>
// Interactive Svelte component with a reactive counter.
// Used by `svelte/client-side-render` to assert that:
// - the component renders with initial state after mount
// - clicking the button updates the rendered state
// - interactivity still works after a re-render via update
let count = $state(0);
</script>

<div class="interactive-counter">
	<button type="button" class="increment" onclick={() => count++}>+1</button>
	<span class="count">{count}</span>
</div>
