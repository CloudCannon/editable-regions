<script setup lang="ts">
withDefaults(
	defineProps<{
		quote?: string;
		author?: string;
		role?: string;
		avatar?: string;
		featured?: boolean;
	}>(),
	{ quote: "", author: "", role: "", avatar: "", featured: false },
);
</script>

<template>
	<section class="section">
		<figure class="card" :class="{ 'card--featured': featured }">
			<p v-if="featured" class="pill">Customer story</p>

			<blockquote>
				<editable-text data-prop="quote" data-type="text">{{ quote }}</editable-text>
			</blockquote>

			<figcaption>
				<editable-image v-if="avatar" data-prop-src="avatar">
					<img :src="avatar" :alt="author" width="48" height="48" />
				</editable-image>
				<strong data-editable="text" data-prop="author">{{ author }}</strong>
				<span data-editable="text" data-prop="role">{{ role }}</span>
			</figcaption>
		</figure>
	</section>
</template>
