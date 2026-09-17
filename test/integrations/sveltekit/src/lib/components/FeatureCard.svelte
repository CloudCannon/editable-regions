<script>
	let {
		title = "",
		description = "",
		badge = "",
		highlighted = false,
		items = [],
	} = $props();

	const footnote = $derived(items.length === 1 ? "1 item" : `${items.length} items`);
</script>

<div
	class="card"
	style={highlighted ? "border-color: var(--accent); border-width: 2px" : ""}
>
	{#if badge?.trim()}
		<p>
			<em><editable-text data-prop="badge">{badge}</editable-text></em>
		</p>
	{/if}

	<h3>
		<editable-text data-prop="title">{title}</editable-text>
	</h3>

	<p>
		<editable-text data-prop="description">{description}</editable-text>
	</p>

	<ul data-editable="array" data-prop="items">
		{#each items as item (item)}
			<li data-editable="array-item">
				<editable-text data-prop="">{item}</editable-text>
			</li>
		{/each}
	</ul>

	<!-- Derived from items.length — only a component re-render can update this. -->
	<small>{footnote}</small>
</div>
