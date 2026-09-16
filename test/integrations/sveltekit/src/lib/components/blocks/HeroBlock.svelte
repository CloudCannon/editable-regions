<script>
	let {
		heading = "",
		subheading = "",
		image = "",
		image_alt = "",
	} = $props();
</script>

<div class="block block--hero">
	<h2>
		<editable-text data-prop="heading">{heading}</editable-text>
	</h2>
	<p>
		<editable-text data-prop="subheading">{subheading}</editable-text>
	</p>
	{#if image}
		<editable-image data-prop-src="image" data-prop-alt="image_alt">
			<img src={image} alt={image_alt} width="480" height="320" />
		</editable-image>
	{/if}
</div>
