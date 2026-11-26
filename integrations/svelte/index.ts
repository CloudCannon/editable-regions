import "../../helpers/globals.js";
import * as svelte from "svelte";
import { addEditableComponentRenderer } from "../../helpers/cloudcannon.js";
import EditableRegionsComponent from "./EditableRegions.svelte";

/** Extra props are forwarded to `tag`. */
export type EditableRegionsProps = { tag?: string } & Record<string, any>;

export const EditableRegions =
	EditableRegionsComponent as unknown as svelte.SvelteComponentTyped<EditableRegionsProps>;

type Mount = (
	component: any,
	args: { target: HTMLElement; props: Record<string, any> },
) => void;

export const registerSvelteComponent = (
	key: string,
	component: unknown,
): void => {
	// Svelte 5 exposes mount/flushSync; Svelte 3/4 do not.
	const svelteRuntime = svelte as unknown as {
		mount?: Mount;
		flushSync?: () => void;
	};
	const mount =
		typeof svelteRuntime.mount === "function" ? svelteRuntime.mount : undefined;
	const flushSync =
		typeof svelteRuntime.flushSync === "function"
			? svelteRuntime.flushSync
			: undefined;

	const wrappedComponent = (props: Record<string, any>) => {
		const rootEl = document.createElement("div");

		if (mount) {
			mount(component, {
				target: rootEl,
				props,
			});
		} else {
			const LegacyComponent = component as new (options: {
				target: HTMLElement;
				props: Record<string, any>;
			}) => unknown;
			new LegacyComponent({ target: rootEl, props });
		}

		// Svelte 4 has no flushSync, and its legacy constructor renders synchronously.
		flushSync?.();

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
