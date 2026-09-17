<script setup lang="ts">
withDefaults(
	defineProps<{
		heading?: string;
		subheading?: string;
		image?: string;
		image_alt?: string;
		actions?: { label?: string; href?: string; variant?: string }[];
	}>(),
	{
		heading: "",
		subheading: "",
		image: "",
		image_alt: "",
		actions: () => [],
	},
);
</script>

<template>
	<section class="hero">
		<div class="hero__copy">
			<h2 data-editable="text" data-prop="heading">{{ heading }}</h2>
			<p data-editable="text" data-type="text" data-prop="subheading">
				{{ subheading }}
			</p>

			<div class="hero__actions" data-editable="array" data-prop="actions">
				<span
					v-for="action in actions"
					:key="action.href"
					data-editable="array-item"
				>
					<a
						v-if="action.label?.trim()"
						class="btn"
						:class="`btn--${action.variant || 'primary'}`"
						:href="action.href"
					>
						<editable-text data-prop="label">{{ action.label }}</editable-text>
					</a>
				</span>
			</div>
		</div>

		<editable-image
			v-if="image"
			class="hero__media"
			data-prop-src="image"
			data-prop-alt="image_alt"
		>
			<img :src="image" :alt="image_alt" width="480" height="320" />
		</editable-image>
	</section>
</template>
