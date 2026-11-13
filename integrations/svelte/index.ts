import "../../helpers/globals.js";
import type { Component } from "svelte";
import { addEditableComponentRenderer } from "../../helpers/cloudcannon.js";
import EditableRegionsComponent from "./EditableRegions.svelte";

/** Extra props are forwarded to `tag`. */
export type EditableRegionsProps = { tag?: string } & Record<string, any>;

// Typed explicitly so the emitted declaration is concrete rather than `any`.
export const EditableRegions: Component<EditableRegionsProps> =
	EditableRegionsComponent;

type Mount = (
	component: any,
	args: { target: HTMLElement; props: Record<string, any> },
) => void;

let mount: Mount | undefined;
let flushSync!: () => void;
try {
	({ mount, flushSync } = await import("svelte"));
} catch {
	// Svelte 4 — no mount export
}

export const registerSvelteComponent = (
	key: string,
	component: unknown,
): void => {
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

		flushSync();

		return rootEl;
	};

	addEditableComponentRenderer(key, wrappedComponent);
};
