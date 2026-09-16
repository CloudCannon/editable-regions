<script setup lang="ts">
import cta from "../../data/cta.json";
import footer from "../../data/footer.json";
</script>

<template>
	<footer class="site-footer">
		<div class="site-footer__inner">
			<p>
				<editable-text data-prop="@data[footer].tagline">{{
					footer.tagline
				}}</editable-text>
			</p>

			<!-- An array container must hold only its own rows and blueprints. -->
			<div
				class="site-footer__columns"
				data-editable="array"
				data-prop="@data[footer].columns"
			>
				<div
					v-for="column in footer.columns"
					:key="column.heading"
					data-editable="array-item"
				>
					<!-- Relative paths from here down: the @data[...] prefix never repeats. -->
					<h3 data-editable="text" data-prop="heading">{{ column.heading }}</h3>

					<ul data-editable="array" data-prop="links">
						<li
							v-for="link in column.links"
							:key="link.href"
							data-editable="array-item"
						>
							<a :href="link.href">
								<editable-text data-prop="label">{{ link.label }}</editable-text>
							</a>
						</li>
					</ul>
				</div>
			</div>

			<editable-component data-component="call-to-action" data-prop="@data[cta]">
				<CallToAction v-bind="cta" />
			</editable-component>
		</div>
	</footer>
</template>
