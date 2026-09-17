<script>
	let {
		heading = "",
		subheading = "",
		image = "",
		image_alt = "",
		actions = [],
	} = $props();
</script>

<section class="hero">
	<div class="hero__copy">
		<h2 data-editable="text" data-prop="heading">{heading}</h2>
		<p data-editable="text" data-type="text" data-prop="subheading">{subheading}</p>

		<div class="hero__actions" data-editable="array" data-prop="actions">
			{#each actions as action (action.href)}
				<span data-editable="array-item">
					{#if action.label?.trim()}
						<a
							class="btn btn--{action.variant || 'primary'}"
							href={action.href}
						>
							<editable-text data-prop="label">{action.label}</editable-text>
						</a>
					{/if}
				</span>
			{/each}
		</div>
	</div>

	{#if image}
		<editable-image class="hero__media" data-prop-src="image" data-prop-alt="image_alt">
			<img src={image} alt={image_alt} width="480" height="320" />
		</editable-image>
	{/if}
</section>
