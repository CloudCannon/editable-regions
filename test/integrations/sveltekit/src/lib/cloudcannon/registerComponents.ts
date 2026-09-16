import { registerSvelteComponent } from "@cloudcannon/editable-regions/svelte";

import { componentMap } from "./componentMap";

/**
 * Registers each component so CloudCannon's EditableComponent can re-render it
 * in the browser. Loaded only in the Visual Editor — see the onMount gate in
 * src/routes/+layout.svelte.
 */
for (const [key, component] of Object.entries(componentMap)) {
	registerSvelteComponent(key, component);
}
