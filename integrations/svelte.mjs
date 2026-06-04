import { addEditableComponentRenderer } from "../helpers/cloudcannon.mjs";

/** @type{((component: any, args: { target: HTMLElement, props: unknown }) => void) | undefined} */
let mount;
/** @type{() => void} */
let flushSync;
try {
	({ mount, flushSync } = await import("svelte"));
} catch {
	// Svelte 4 — no mount export
}

/**
 * @param {string} key
 * @param {any} component
 */
export const registerSvelteComponent = (key, component) => {
	/**
	 * @param {unknown} props
	 * @returns
	 */
	const wrappedComponent = (props) => {
		const rootEl = document.createElement("div");

		if (mount) {
			mount(component, {
				target: rootEl,
				props,
			});
		} else {
			new component({ target: rootEl, props });
		}

		flushSync();

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
