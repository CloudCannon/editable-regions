import { defineComponent } from "vue";

/** Interactive Vue component with a reactive counter. */
export const InteractiveCounter = defineComponent({
	name: "InteractiveCounter",
	data: () => ({ count: 0 }),
	template: `
		<div class="interactive-counter">
			<button type="button" class="increment" @click="count++">+1</button>
			<span class="count">{{ count }}</span>
		</div>
	`,
});
