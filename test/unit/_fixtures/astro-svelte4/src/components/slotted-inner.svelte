<script>
	export let title = "Slotted";
</script>

<div class="svelte-slotted">
	<h2>{title}</h2>
	<slot />
	<footer><slot name="footer" /></footer>
</div>
