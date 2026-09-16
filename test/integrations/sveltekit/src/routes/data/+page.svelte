<script>
	import cta from "../../../data/cta.json";
	import footer from "../../../data/footer.json";
	import nav from "../../../data/nav.json";
	import CallToAction from "$lib/components/CallToAction.svelte";
	import { getPage } from "$lib/content";

	const page = getPage("data");
</script>

<svelte:head>
	<title>{page.data.title} — SvelteKit harness</title>
</svelte:head>

<div>
	<h1 data-editable="text" data-type="span" data-prop="title">
		{page.data.title}
	</h1>

	<section class="test-section">
		<h2>@data[nav] — flat array</h2>
		<p class="note">
			The same array as the header nav, rendered a second time. Editing either
			copy writes to data/nav.json.
		</p>

		<ul data-editable="array" data-prop="@data[nav].items">
			{#each nav.items as item (item.href)}
				<li data-editable="array-item">
					<editable-text data-prop="label">{item.label}</editable-text>
					<code>{item.href}</code>
				</li>
			{/each}
		</ul>
	</section>

	<section class="test-section">
		<h2>@data[footer].columns — nested arrays</h2>
		<p class="note">
			The @data prefix appears only on the outer wrapper. Inner arrays and
			fields chain with relative paths — an indexed path on a child resolves to
			undefined.
		</p>

		<div class="grid" data-editable="array" data-prop="@data[footer].columns">
			{#each footer.columns as column (column.heading)}
				<div class="card" data-editable="array-item">
					<h3 data-editable="text" data-prop="heading">{column.heading}</h3>
					<ul data-editable="array" data-prop="links">
						{#each column.links as link (link.href)}
							<li data-editable="array-item">
								<editable-text data-prop="label">{link.label}</editable-text>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<section class="test-section">
		<h2>@data[cta] — component region</h2>
		<p class="note">
			A registered Svelte component whose props are the whole data file.
			Toggling show_button or theme in the sidebar should re-render this live.
		</p>

		<editable-component data-component="call-to-action" data-prop="@data[cta]">
			<CallToAction {...cta} />
		</editable-component>
	</section>
</div>
