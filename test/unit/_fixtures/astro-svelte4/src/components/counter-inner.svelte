<script>
	export let label = "Counter";
	let count = 0;
</script>

<div class="svelte-counter">
	<h2>{label}</h2>
	<p class="count">Count: {count}</p>
	<button type="button" class="increment" on:click={() => count++}>
		Increment
	</button>
</div>
