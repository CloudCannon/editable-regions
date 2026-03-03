import "@cloudcannon/editable-regions/astro-react-renderer";

import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import { registerReactComponent } from "@cloudcannon/editable-regions/react";

import ReactTest from "./src/components/react-test.astro";
import ReactTestInner from "./src/components/react-test-inner";
import SlotTest from "./src/components/slot-test.astro";
import AstroTest from "./src/components/astro-test.astro";
import TransitionBox from "./src/components/transition-box.astro";
import AssetsBox from "./src/components/assets-box.astro";
import ContentCard from "./src/components/content-card.astro";
import I18nLink from "./src/components/i18n-link.astro";
import ActionsButton from "./src/components/actions-button.astro";
import MiddlewareInfo from "./src/components/middleware-info.astro";
import EnvDisplay from "./src/components/env-display.astro";

registerAstroComponent("astro-test", AstroTest);
registerAstroComponent("slot-test", SlotTest);
registerAstroComponent("react-test", ReactTest);
registerAstroComponent("transition-box", TransitionBox);
registerAstroComponent("assets-box", AssetsBox);
registerAstroComponent("content-card", ContentCard);
registerAstroComponent("i18n-link", I18nLink);
registerAstroComponent("actions-button", ActionsButton);
registerAstroComponent("middleware-info", MiddlewareInfo);
registerAstroComponent("env-display", EnvDisplay);
registerReactComponent("react-test-inner", ReactTestInner);
