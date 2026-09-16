<script>
	/**
	 * Rows are <details>, so each carries browser-managed open/closed state that
	 * a component re-render can clobber.
	 */
	let { heading = "", items = [] } = $props();
</script>

<section class="section">
	<h2 data-editable="text" data-prop="heading">{heading}</h2>

	<div data-editable="array" data-prop="items">
		{#each items as item (item.question)}
			<details class="card" data-editable="array-item">
				<summary>
					<editable-text data-prop="question">{item.question}</editable-text>
				</summary>
				<p data-editable="text" data-type="text" data-prop="answer">
					{item.answer}
				</p>
			</details>
		{/each}
	</div>
</section>
