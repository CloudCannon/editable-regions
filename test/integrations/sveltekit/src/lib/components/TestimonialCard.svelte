<script>
	let { quote = "", author = "", role = "", avatar = "", featured = false } = $props();
</script>

<section class="section">
	<figure class="card" class:card--featured={featured}>
		{#if featured}
			<p class="pill">Customer story</p>
		{/if}

		<blockquote>
			<editable-text data-prop="quote" data-type="text">{quote}</editable-text>
		</blockquote>

		<figcaption>
			{#if avatar}
				<editable-image data-prop-src="avatar">
					<img src={avatar} alt={author} width="48" height="48" />
				</editable-image>
			{/if}
			<strong data-editable="text" data-prop="author">{author}</strong>
			<span data-editable="text" data-prop="role">{role}</span>
		</figcaption>
	</figure>
</section>
