import "../helpers/globals.js";
import type { HTMLAttributes } from "vue";
import {
	createApp,
	defineComponent,
	h,
	onMounted,
	onUnmounted,
	ref,
} from "vue";
import { addEditableComponentRenderer } from "../helpers/cloudcannon.js";

declare global {
	namespace JSX {
		interface IntrinsicElements {
			"editable-component": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-component": string;
			};
			"editable-text": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-type"?: "block" | "text" | "span";
			};
			"editable-image": HTMLAttributes & {
				class?: string;
				"data-prop"?: string;
				"data-prop-src"?: string;
				"data-prop-alt"?: string;
				"data-prop-title"?: string;
			};
			"editable-source": HTMLAttributes & {
				class?: string;
				"data-path": string;
				"data-key": string;
			};
			"editable-array": HTMLAttributes & {
				class?: string;
				"data-prop": string;
				"data-id-key"?: string;
				"data-component-key"?: string;
				"data-component"?: string;
				"data-direction"?: "column" | "row" | "column-reverse" | "row-reverse";
			};
			"editable-array-item": HTMLAttributes & {
				class?: string;
				"data-id"?: string;
				"data-component"?: string;
			};
		}
	}
}

export const registerVueComponent = (key: string, component: any): void => {
	const wrappedComponent = (props: any): HTMLElement => {
		const rootEl = document.createElement("div");
		const app = createApp({ render: () => h(component, props) });
		app.mount(rootEl);

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};

// Waits for framework hydration before connecting, so regions aren't mutated mid-hydration.
export const EditableRegions = defineComponent({
	name: "EditableRegions",
	props: {
		tag: {
			type: String,
			default: "div",
		},
	},
	inheritAttrs: false,
	setup(props, { attrs, slots }) {
		const element = ref<HTMLElement | null>(null);
		let editable: any = null;
		let pendingLoadHandler: (() => void) | null = null;

		const connectEditable = (regions: any) => {
			if (!regions || editable) {
				return;
			}

			editable = new regions.Editable(element.value);
			editable.connect();
		};

		onMounted(() => {
			const regions = (window as any).editableRegions;
			if (regions) {
				connectEditable(regions);
				return;
			}

			pendingLoadHandler = () => {
				connectEditable((window as any).editableRegions);
			};
			document.addEventListener("editable-regions:load", pendingLoadHandler, {
				once: true,
			});
		});

		onUnmounted(() => {
			if (pendingLoadHandler) {
				document.removeEventListener(
					"editable-regions:load",
					pendingLoadHandler,
				);
				pendingLoadHandler = null;
			}

			editable?.disconnect();
			editable = null;
		});

		return () => {
			// data-prop and data-literal are controlled here; user-supplied ones are dropped.
			const forwarded: Record<string, any> = {};
			for (const [name, value] of Object.entries(attrs)) {
				if (/^data-(prop|literal)/i.test(name)) {
					continue;
				}
				forwarded[name] = value;
			}

			return h(
				props.tag,
				{
					...forwarded,
					ref: element,
					"data-editable": "_dynamic",
					"data-prop": "",
				},
				slots.default?.(),
			);
		};
	},
});
