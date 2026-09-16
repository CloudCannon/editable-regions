import { registerVueComponent } from "@cloudcannon/editable-regions/vue";

import { componentMap } from "./componentMap";

for (const [key, component] of Object.entries(componentMap)) {
	registerVueComponent(key, component);
}
