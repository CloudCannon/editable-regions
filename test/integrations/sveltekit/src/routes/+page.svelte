<script>
	import nav from "../../data/nav.json";

	const tests = nav.items.filter((item) => item.href !== "/");
</script>

<svelte:head>
	<title>Editable regions — SvelteKit harness</title>
</svelte:head>

<div>
	<h1>Editable regions — SvelteKit harness</h1>
	<p>
		One page per region type. Open each in the CloudCannon Visual Editor.
	</p>

	<ul>
		{#each tests as test (test.href)}
			<li><a href={test.href}>{test.label}</a></li>
		{/each}
	</ul>
</div>
