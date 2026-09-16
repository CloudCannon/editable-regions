import {
	createApp,
	defineComponent,
	h,
	onMounted,
	onUnmounted,
	ref,
} from "vue";
import { addEditableComponentRenderer } from "../helpers/cloudcannon.mjs";

/**
 * Registers a Vue component with the CloudCannon component system.
 * Creates a wrapper that renders the Vue component to an HTMLElement.
 *
 * @param {string} key - Unique identifier for the component
 * @param {any} component - The Vue component to register
 * @returns {void}
 */
export const registerVueComponent = (key, component) => {
	/**
	 * Wrapper function that renders the Vue component to an HTMLElement.
	 *
	 * @param {any} props - Props to pass to the Vue component
	 * @returns {HTMLElement} The rendered component as an HTMLElement
	 */
	const wrappedComponent = (props) => {
		const rootEl = document.createElement("div");
		const app = createApp({ render: () => h(component, props) });
		app.mount(rootEl);

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};

/**
 * Root editable region component. Renders a configurable element (default
 * `div`) marked with `data-editable="_dynamic"`, and connects a base editable
 * node to it only once the surrounding Vue app has mounted. This keeps
 * editable regions from mutating the DOM before frameworks like Nuxt finish
 * hydrating.
 *
 * The editable node classes are not bundled with this component: in the
 * CloudCannon editor they are exposed as `window.editableRegions` by the
 * editable regions script, which also dispatches `editable-regions:load`
 * when they become available. Outside the editor this component renders
 * its element and does nothing.
 *
 * The component hardcodes `data-editable="_dynamic"` and `data-prop=""` on its
 * element: the resulting editable node resolves the current file and passes it
 * through to descendant editable regions, which resolve their own relative
 * `data-prop` paths against it. User-supplied `data-prop*` and `data-literal*`
 * attributes are ignored.
 *
 * @param {string} [props.tag] - Element type to render. Defaults to "div".
 * All other props and attributes are forwarded to the rendered element.
 */
export const EditableRegions = defineComponent({
	name: "EditableRegions",
	props: {
		tag: {
			type: String,
			default: "div",
		},
	},
	inheritAttrs: false,
	/**
	 * @param {{ tag: string }} props
	 * @param {{ attrs: any; slots: any }} context
	 */
	setup(props, { attrs, slots }) {
		const element = ref(null);
		/** @type {any} */
		let editable = null;
		/** @type {(() => void) | null} */
		let pendingLoadHandler = null;

		/** @param {any} regions */
		const connectEditable = (regions) => {
			if (!regions || editable) {
				return;
			}

			editable = new regions.Editable(element.value);
			editable.connect();
		};

		onMounted(() => {
			const regions = /** @type {any} */ (window).editableRegions;
			if (regions) {
				connectEditable(regions);
				return;
			}

			pendingLoadHandler = () => {
				connectEditable(/** @type {any} */ (window).editableRegions);
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

		/** @type {boolean} */
		let hasWarned = false;

		return () => {
			/** @type {Record<string, any>} */
			const forwarded = {};
			for (const [name, value] of Object.entries(attrs)) {
				if (/^data-(prop|literal)/i.test(name)) {
					if (!hasWarned) {
						hasWarned = true;
						console.warn(
							`[EditableRegions] Ignoring the '${name}' attribute: data-prop and data-literal attributes are controlled by the component itself, which resolves the current file's data.`,
						);
					}
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
				/** @type {any} */ (slots.default?.()),
			);
		};
	},
});
