<script>
	import cta from "../../../data/cta.json";
	import footer from "../../../data/footer.json";
	import CallToAction from "./CallToAction.svelte";
</script>

<footer class="site-footer">
	<div class="site-footer__inner">
		<p>
			<editable-text data-prop="@data[footer].tagline">{footer.tagline}</editable-text>
		</p>

		<!--
			An array container must hold only its own rows and blueprints — the
			tagline above and the CTA below sit outside it.
		-->
		<div class="site-footer__columns" data-editable="array" data-prop="@data[footer].columns">
			{#each footer.columns as column (column.heading)}
				<div data-editable="array-item">
					<!-- Relative paths from here down: the @data[...] prefix never repeats. -->
					<h3 data-editable="text" data-prop="heading">{column.heading}</h3>

					<ul data-editable="array" data-prop="links">
						{#each column.links as link (link.href)}
							<li data-editable="array-item">
								<a href={link.href}>
									<editable-text data-prop="label">{link.label}</editable-text>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<editable-component data-component="call-to-action" data-prop="@data[cta]">
			<CallToAction {...cta} />
		</editable-component>
	</div>
</footer>
