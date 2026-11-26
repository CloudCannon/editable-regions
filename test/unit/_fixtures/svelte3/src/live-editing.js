import { registerSvelteComponent } from "@cloudcannon/editable-regions/svelte";

import EditableRegionsFixture from "./editable-regions.svelte";
import Greeting from "./greeting.svelte";

registerSvelteComponent("svelte3-greeting", Greeting);
registerSvelteComponent("svelte3-editable-regions", EditableRegionsFixture);
