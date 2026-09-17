<script setup lang="ts">
import nav from "../../data/nav.json";
</script>

<template>
	<header class="site-header">
		<div class="site-header__inner">
			<strong>
				<editable-text data-prop="@data[nav].brand">{{ nav.brand }}</editable-text>
			</strong>

			<ul
				class="site-header__nav"
				data-editable="array"
				data-prop="@data[nav].items"
			>
				<li
					v-for="item in nav.items"
					:key="item.href"
					data-editable="array-item"
				>
					<NuxtLink :href="item.href">
						<editable-text data-prop="label">{{ item.label }}</editable-text>
					</NuxtLink>
				</li>
			</ul>
		</div>
	</header>
</template>
