import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";

import Greeting from "../components/greeting.astro";
import WithSlot from "../components/with-slot.astro";

registerAstroComponent("astro2-greeting", Greeting);
registerAstroComponent("astro2-slot", WithSlot);

globalThis.__envClient =
	typeof ENV_CLIENT === "undefined" ? "undefined" : ENV_CLIENT;
globalThis.__collectionsMode =
	typeof __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__ === "undefined"
		? "undefined"
		: __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__;
