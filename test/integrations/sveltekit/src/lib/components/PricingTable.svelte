<script>
	let {
		heading = "",
		tiers = [],
	} = $props();

	// Derived from the data — only a component re-render can keep this current.
	const summary = $derived.by(() => {
		const count = tiers.length;
		const featured = tiers.find((tier) => tier.highlighted)?.name;
		return featured
			? `${count} plans — ${featured} is our most popular`
			: `${count} plans`;
	});
</script>

<section class="section">
	<h2 data-editable="text" data-prop="heading">{heading}</h2>

	<div class="grid" data-editable="array" data-prop="tiers">
		{#each tiers as tier (tier.name)}
			<div class="card" class:card--featured={tier.highlighted} data-editable="array-item">
				{#if tier.badge?.trim()}
					<p class="pill">
						<editable-text data-prop="badge">{tier.badge}</editable-text>
					</p>
				{/if}

				<h3 data-editable="text" data-prop="name">{tier.name}</h3>
				<p class="price" data-editable="text" data-prop="price">{tier.price}</p>

				<ul data-editable="array" data-prop="perks">
					{#each tier.perks as perk (perk)}
						<li data-editable="array-item">
							<editable-text data-prop="">{perk}</editable-text>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	<p class="note">{summary}</p>
</section>
