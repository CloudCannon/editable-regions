<script>
	import { blockMap } from "$lib/cloudcannon/componentMap";
	import { getPage } from "$lib/content";

	const page = getPage("page-builder");

	const blocks = $derived(
		(page.data.content_blocks ?? []).filter(
			(block) => block._type && blockMap[block._type],
		),
	);
</script>

<svelte:head>
	<title>{page.data.title} — SvelteKit harness</title>
</svelte:head>

<div>
	<h1 data-editable="text" data-type="span" data-prop="title">
		{page.data.title}
	</h1>

	<section class="test-section">
		<h2>content_blocks</h2>
		<p class="note">
			Three layers on every block: the array wrapper names the field that picks
			a component, each row is both an array-item and a component, and every
			visible field inside a block has its own region.
		</p>

		<!--
			data-id-key is omitted deliberately — it defaults to data-component-key,
			and _type is also what identifies each row here.
		-->
		<div data-editable="array" data-prop="content_blocks" data-component-key="_type">
			{#each blocks as block, index (`${block._type}-${index}`)}
				{@const Block = blockMap[block._type]}
				<div data-editable="array-item" data-component={block._type}>
					<Block {...block} />
				</div>
			{/each}
		</div>
	</section>
</div>
