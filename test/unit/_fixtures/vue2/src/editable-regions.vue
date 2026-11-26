<template>
	<EditableRegions
		tag="section"
		class="outer"
		:class="{ dynamic: true }"
		style="color: red"
		data-extra="ok"
		data-prop="ignored"
		@click="onClick"
	>
		<span class="inner">{{ message }} {{ clicks }}</span>
	</EditableRegions>
</template>

<script>
import { EditableRegions } from "@cloudcannon/editable-regions/vue";

export default {
	name: "EditableRegionsFixture",
	components: { EditableRegions },
	props: {
		message: { type: String, default: "hello" },
	},
	data() {
		return { clicks: 0 };
	},
	methods: {
		onClick() {
			this.clicks += 1;
		},
	},
};
</script>
