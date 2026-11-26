import "../helpers/globals.js";
import type { Component, DefineComponent, HTMLAttributes } from "vue";
import * as Vue from "vue";
import {
	defineComponent,
	getCurrentInstance,
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

export type EditableRegionsProps = Omit<HTMLAttributes, "data-prop"> & {
	tag?: string;
};

type Vue2Constructor = new (options: {
	render: () => unknown;
}) => { $mount: (el?: Element) => unknown; $el: HTMLElement };

// Vue 3 exposes createApp; Vue 2.7 does not. Import the namespace rather than
// `createApp` so the same entry resolves against Vue 2.7's ESM build.
const vueRuntime = Vue as unknown as {
	createApp?: (options: { render: () => unknown }) => {
		mount: (el: Element) => unknown;
	};
	default?: Vue2Constructor;
};
const createApp = vueRuntime.createApp;
const Vue2 = vueRuntime.default;
const isVue2 = typeof createApp !== "function";

export const registerVueComponent = (key: string, component: unknown): void => {
	const wrappedComponent = (props: any): HTMLElement => {
		const rootEl = document.createElement("div");

		if (createApp) {
			const app = createApp({ render: () => h(component as Component, props) });
			app.mount(rootEl);
			return rootEl;
		}

		if (!Vue2) {
			throw new Error(
				"@cloudcannon/editable-regions/vue could not find a Vue 2 constructor. Is vue installed?",
			);
		}

		// Vue 2 mounts by replacing the target element, so mount detached and
		// move the rendered root into the same container shape Vue 3 returns.
		const vm = new Vue2({
			render: () => h(component as Component, { props }),
		});
		vm.$mount();
		rootEl.appendChild(vm.$el);

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};

// Waits for framework hydration before connecting, so regions aren't mutated mid-hydration.
const EditableRegionsComponent = defineComponent({
	name: "EditableRegions",
	props: {
		tag: {
			type: String,
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

			if (isVue2) {
				// Vue 2 keeps attrs and listeners in separate render-data keys.
				// class/style and `.native` listeners are inherited by the root
				// automatically, so only forward attrs and custom listeners.
				const instance = (getCurrentInstance() as any)?.proxy;

				return h(
					props.tag ?? "div",
					{
						on: instance?.$listeners ?? {},
						attrs: {
							...forwarded,
							"data-editable": "_dynamic",
							"data-prop": "",
						},
						ref: element,
					},
					slots.default?.(),
				);
			}

			return h(
				props.tag ?? "div",
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

export const EditableRegions =
	EditableRegionsComponent as unknown as DefineComponent<EditableRegionsProps>;
