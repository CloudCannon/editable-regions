<script>
	let {
		heading = "",
		button_label = "",
		button_url = "",
		theme = "light",
	} = $props();
</script>

<div class="block block--cta">
	<div class="cta cta--{theme}">
		<h2>
			<editable-text data-prop="heading">{heading}</editable-text>
		</h2>
		{#if button_label?.trim()}
			<a class="cta__button" href={button_url}>
				<editable-text data-prop="button_label">{button_label}</editable-text>
			</a>
		{/if}
	</div>
</div>
