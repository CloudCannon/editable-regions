<script setup lang="ts">
import { EditableRegions } from "@cloudcannon/editable-regions/vue";

// Every editable region must sit inside this one EditableRegions root — regions outside it connect as orphans at scan time and can mutate the DOM before hydration.
</script>

<template>
	<EditableRegions tag="div">
		<SiteHeader />
		<main>
			<slot />
		</main>
		<SiteFooter />
	</EditableRegions>
</template>
