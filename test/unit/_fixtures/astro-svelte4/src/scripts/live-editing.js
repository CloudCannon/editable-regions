import "@cloudcannon/editable-regions/astro-svelte-renderer";
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";

import CollectionList from "../components/collection-list.astro";
import Idle from "../components/idle.astro";
import Load from "../components/load.astro";
import Media from "../components/media.astro";
import Slotted from "../components/slotted.astro";
import SlottedLoad from "../components/slotted-load.astro";
import Static from "../components/static.astro";
import Visible from "../components/visible.astro";

registerAstroComponent("svelte4-collection", CollectionList);
registerAstroComponent("svelte4-static", Static);
registerAstroComponent("svelte4-slotted", Slotted);
registerAstroComponent("svelte4-load", Load);
registerAstroComponent("svelte4-idle", Idle);
registerAstroComponent("svelte4-visible", Visible);
registerAstroComponent("svelte4-media", Media);
registerAstroComponent("svelte4-slotted-load", SlottedLoad);

globalThis.__envClient =
	typeof ENV_CLIENT === "undefined" ? "undefined" : ENV_CLIENT;
globalThis.__collectionsMode =
	typeof __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__ === "undefined"
		? "undefined"
		: __EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__;
