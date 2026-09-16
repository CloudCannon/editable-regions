import { registerReactComponent } from "@cloudcannon/editable-regions/react";

import { componentMap } from "./componentMap";

/**
 * Registers every component reachable by a `data-component` attribute so
 * CloudCannon's EditableComponent can re-render it in the browser.
 *
 * Loaded only inside the Visual Editor — see components/CloudCannonEditor.tsx.
 */
for (const [key, component] of Object.entries(componentMap)) {
	registerReactComponent(key, component);
}
