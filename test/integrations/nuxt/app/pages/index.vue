<script setup lang="ts">
import nav from "../../data/nav.json";

const tests = nav.items.filter((item) => item.href !== "/");

useHead({ title: "Editable regions — Vue harness" });
</script>

<template>
	<div>
		<h1>Editable regions — Vue harness</h1>
		<p>
			One page per region type. Open each in the CloudCannon Visual Editor and
			record the result in <code>README.md</code>.
		</p>

		<ul>
			<li v-for="test in tests" :key="test.href">
				<NuxtLink :href="test.href">{{ test.label }}</NuxtLink>
			</li>
		</ul>
	</div>
</template>
