/**
 * Browser-side component override for `card`. The plugin treats the default
 * export as Liquid template source and replaces what `findAllLiquidFiles`
 * picked up (`_includes/card.liquid`) for editor-time renders. Server-side
 * builds keep using the on-disk file.
 */
export default `<article class="card card--overridden" data-source="card-override.mjs">
	<h3>{{ title }}</h3>
	<p>{{ body }}</p>
</article>`;
