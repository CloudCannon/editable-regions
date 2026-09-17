<script>
	let {
		heading = "",
		description = "",
		button_label = "",
		button_url = "",
		show_button = false,
		theme = "dark",
	} = $props();
</script>

<div class="cta cta--{theme}">
	{#if heading}
		<h2>
			<editable-text data-prop="heading">{heading}</editable-text>
		</h2>
	{/if}

	{#if description}
		<p>
			<editable-text data-prop="description" data-type="text">{description}</editable-text>
		</p>
	{/if}

	{#if show_button && button_label?.trim()}
		<a class="cta__button" href={button_url}>
			<editable-text data-prop="button_label">{button_label}</editable-text>
		</a>
	{/if}
</div>
