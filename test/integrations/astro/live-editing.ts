import "@cloudcannon/editable-regions/astro-react-renderer";

import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import { registerReactComponent } from "@cloudcannon/editable-regions/react";

import ReactTest from "./src/components/react-test.astro";
import ReactTestInner from "./src/components/react-test-inner";
import SlotTest from "./src/components/slot-test.astro";
import AstroTest from "./src/components/astro-test.astro";

registerAstroComponent("astro-test", AstroTest);
registerAstroComponent("slot-test", SlotTest);
registerAstroComponent("react-test", ReactTest);
registerReactComponent("react-test-inner", ReactTestInner);
