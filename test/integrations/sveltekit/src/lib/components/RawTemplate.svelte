<script>
	/**
	 * Emits a real `<template>` element carrying an array blueprint.
	 *
	 * A template's children are parsed into its `.content` DocumentFragment,
	 * never its childNodes, so anything Svelte hydrated as children would be
	 * unclaimable. The template must therefore ride through `{@html}` as one raw
	 * chunk: Svelte claims the element as a whole between its `<!---->` markers
	 * and never walks inside it, leaving the browser-parsed `.content` — where
	 * EditableArray looks for the blueprint — intact. That's why blueprints are
	 * authored as HTML strings.
	 */
	let { html } = $props();
</script>

{@html `<template>${html}</template>`}
