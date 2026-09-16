<script>
	import nav from "../../../data/nav.json";
</script>

<header class="site-header">
	<div class="site-header__inner">
		<strong>
			<editable-text data-prop="@data[nav].brand">{nav.brand}</editable-text>
		</strong>

		<ul class="site-header__nav" data-editable="array" data-prop="@data[nav].items">
			{#each nav.items as item (item.href)}
				<li data-editable="array-item">
					<a href={item.href}>
						<editable-text data-prop="label">{item.label}</editable-text>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</header>
