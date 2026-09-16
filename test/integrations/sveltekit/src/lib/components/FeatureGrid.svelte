<script>
	let {
		heading = "",
		items = [],
	} = $props();
</script>

<section class="section">
	<h2 data-editable="text" data-prop="heading">{heading}</h2>

	<div class="grid" data-editable="array" data-prop="items">
		{#each items as item (item.title)}
			<div class="card" data-editable="array-item">
				{#if item.icon}
					<editable-image data-prop-src="icon">
						<img src={item.icon} alt={item.title} width="240" height="160" />
					</editable-image>
				{/if}

				<h3 data-editable="text" data-prop="title">{item.title}</h3>
				<p data-editable="text" data-prop="description">{item.description}</p>

				<!-- Array inside an array item — paths stay relative to this row. -->
				<ul data-editable="array" data-prop="bullets">
					{#each item.bullets as bullet (bullet)}
						<li data-editable="array-item">
							<editable-text data-prop="">{bullet}</editable-text>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</section>
