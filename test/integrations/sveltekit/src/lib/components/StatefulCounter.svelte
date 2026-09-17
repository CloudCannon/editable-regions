<script>
	/**
	 * registerSvelteComponent builds a fresh mount into a new div on every
	 * re-render, so component-local state resets each time CloudCannon pushes
	 * new data.
	 */
	let { label = "", step = 1 } = $props();

	let count = $state(0);
</script>

<div class="card">
	<h3>
		<editable-text data-prop="label">{label}</editable-text>
	</h3>
	<p>Count: <span class="count">{count}</span></p>
	<button type="button" class="increment" onclick={() => (count += step)}>
		Add {step}
	</button>
</div>
