import { defineComponent } from "vue";

/** Minimal Vue component with no props. */
export const StaticComponent = defineComponent({
	name: "StaticComponent",
	template: "<p>hello from vue</p>",
});

/** Vue component with a `count` prop. */
export const CounterComponent = defineComponent({
	name: "CounterComponent",
	props: { count: { type: Number, default: 0 } },
	template: "<p>count: {{ count }}</p>",
});

/** Vue component with a default slot. */
export const SlotShell = defineComponent({
	name: "SlotShell",
	template: `
		<div class="slot-shell">
			<slot />
		</div>
	`,
});

/** Vue component that composes with SlotShell, passing slot content to the child. */
export const SlotParent = defineComponent({
	name: "SlotParent",
	components: { SlotShell },
	template: `
		<div class="slot-parent">
			<SlotShell>
				<p class="slotted">slotted from parent</p>
			</SlotShell>
		</div>
	`,
});
