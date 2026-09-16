<script>
	let { heading = "", items = [] } = $props();
</script>

<div class="block block--features">
	<h2>
		<editable-text data-prop="heading">{heading}</editable-text>
	</h2>

	<div class="grid" data-editable="array" data-prop="items">
		{#each items as item (item.title)}
			<div class="card" data-editable="array-item">
				<h3 data-editable="text" data-prop="title">{item.title}</h3>
				<p data-editable="text" data-prop="description">{item.description}</p>
			</div>
		{/each}
	</div>
</div>
