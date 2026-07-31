import { vi } from "vitest";

/**
 * Waits for a built bundle to publish `window.cc_components`. The Eleventy
 * bundle registers behind an async config replay, so importing it isn't enough.
 * Polls rather than taking a handle off the bundle, matching how the editor
 * discovers components (`nodes/editable-component.ts`).
 */
export function componentsReady() {
	return vi.waitFor(() => {
		if (!window.cc_components) {
			throw new Error("cc_components has not been published");
		}
	});
}
