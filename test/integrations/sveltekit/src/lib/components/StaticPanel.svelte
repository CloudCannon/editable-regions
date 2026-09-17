<script>
	let { heading = "", body = "" } = $props();
</script>

<div class="card">
	<h3>
		<editable-text data-prop="heading">{heading}</editable-text>
	</h3>
	<p>
		<editable-text data-prop="body">{body}</editable-text>
	</p>
</div>
