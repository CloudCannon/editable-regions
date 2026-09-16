<script>
	import FeatureCard from "$lib/components/FeatureCard.svelte";
	import StatefulCounter from "$lib/components/StatefulCounter.svelte";
	import StaticPanel from "$lib/components/StaticPanel.svelte";
	import { getPage } from "$lib/content";

	const page = getPage("component");
</script>

<svelte:head>
	<title>{page.data.title} — SvelteKit harness</title>
</svelte:head>

<div>
	<h1 data-editable="text" data-type="span" data-prop="title">
		{page.data.title}
	</h1>

	<section class="test-section">
		<h2>Static component</h2>
		<p class="note">
			Baseline: registerSvelteComponent("static-panel"). Editing heading or body
			should update both inline and from the sidebar.
		</p>

		<editable-component data-component="static-panel" data-prop="panel">
			<StaticPanel {...page.data.panel} />
		</editable-component>
	</section>

	<section class="test-section">
		<h2>Conditional / derived component</h2>
		<p class="note">
			Badge visibility, border styling and the item count are all computed from
			data. Only a component re-render can keep them in sync.
		</p>

		<editable-component data-component="feature-card" data-prop="card">
			<FeatureCard {...page.data.card} />
		</editable-component>
	</section>

	<section class="test-section">
		<h2>Stateful component</h2>
		<p class="note">
			Click the button, then edit the label. A fresh mount per re-render
			means the count is expected to reset — this section is here to confirm
			that behaviour in a real editor, not to assert it is correct.
		</p>

		<editable-component data-component="stateful-counter" data-prop="counter">
			<StatefulCounter {...page.data.counter} />
		</editable-component>
	</section>
</div>
