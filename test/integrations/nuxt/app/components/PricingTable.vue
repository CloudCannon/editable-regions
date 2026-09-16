<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		heading?: string;
		tiers?: {
			name?: string;
			price?: string;
			badge?: string;
			highlighted?: boolean;
			perks?: string[];
		}[];
	}>(),
	{ heading: "", tiers: () => [] },
);

const summary = computed(() => {
	const count = props.tiers.length;
	const featured = props.tiers.find((tier) => tier.highlighted)?.name;
	return featured
		? `${count} plans — ${featured} is our most popular`
		: `${count} plans`;
});
</script>

<template>
	<section class="section">
		<h2 data-editable="text" data-prop="heading">{{ heading }}</h2>

		<div class="grid" data-editable="array" data-prop="tiers">
			<div
				v-for="tier in tiers"
				:key="tier.name"
				class="card"
				:class="{ 'card--featured': tier.highlighted }"
				data-editable="array-item"
			>
				<p v-if="tier.badge?.trim()" class="pill">
					<editable-text data-prop="badge">{{ tier.badge }}</editable-text>
				</p>

				<h3 data-editable="text" data-prop="name">{{ tier.name }}</h3>
				<p class="price" data-editable="text" data-prop="price">{{ tier.price }}</p>

				<ul data-editable="array" data-prop="perks">
					<li v-for="perk in tier.perks" :key="perk" data-editable="array-item">
						<editable-text data-prop="">{{ perk }}</editable-text>
					</li>
				</ul>
			</div>
		</div>

		<p class="note">{{ summary }}</p>
	</section>
</template>
