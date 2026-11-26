import { registerVueComponent } from "@cloudcannon/editable-regions/vue";

import EditableRegionsFixture from "./editable-regions.vue";
import Greeting from "./greeting.vue";

registerVueComponent("vue2-greeting", Greeting);
registerVueComponent("vue2-editable-regions", EditableRegionsFixture);
