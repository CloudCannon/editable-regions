import type { Component } from "vue";

import CallToAction from "../components/CallToAction.vue";
import FaqList from "../components/FaqList.vue";
import FeatureCard from "../components/FeatureCard.vue";
import FeatureGrid from "../components/FeatureGrid.vue";
import HeroSection from "../components/HeroSection.vue";
import PricingTable from "../components/PricingTable.vue";
import StaticPanel from "../components/StaticPanel.vue";
import StatefulCounter from "../components/StatefulCounter.vue";
import TestimonialCard from "../components/TestimonialCard.vue";
import CtaBlock from "../components/blocks/CtaBlock.vue";
import FeaturesBlock from "../components/blocks/FeaturesBlock.vue";
import HeroBlock from "../components/blocks/HeroBlock.vue";

/**
 * Page-builder blocks, keyed by the `_type` value in `content_blocks`.
 *
 * `page-builder.vue` renders from this map and `registerComponents.ts`
 * registers from it, so a block type cannot be rendered without also being
 * registered for re-rendering.
 */
export const blockMap: Record<string, Component> = {
	hero: HeroBlock,
	features: FeaturesBlock,
	cta: CtaBlock,
};

/** Every component reachable by a `data-component` attribute. */
export const componentMap: Record<string, Component> = {
	...blockMap,
	"call-to-action": CallToAction,
	"static-panel": StaticPanel,
	"feature-card": FeatureCard,
	"stateful-counter": StatefulCounter,

	"hero-section": HeroSection,
	"feature-grid": FeatureGrid,
	testimonial: TestimonialCard,
	"pricing-table": PricingTable,
	"faq-list": FaqList,
};
