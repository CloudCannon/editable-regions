import type { Component } from "svelte";

import CallToAction from "../components/CallToAction.svelte";
import FaqList from "../components/FaqList.svelte";
import FeatureCard from "../components/FeatureCard.svelte";
import FeatureGrid from "../components/FeatureGrid.svelte";
import HeroSection from "../components/HeroSection.svelte";
import PricingTable from "../components/PricingTable.svelte";
import StaticPanel from "../components/StaticPanel.svelte";
import StatefulCounter from "../components/StatefulCounter.svelte";
import TestimonialCard from "../components/TestimonialCard.svelte";
import CtaBlock from "../components/blocks/CtaBlock.svelte";
import FeaturesBlock from "../components/blocks/FeaturesBlock.svelte";
import HeroBlock from "../components/blocks/HeroBlock.svelte";

/**
 * Page-builder blocks, keyed by the `_type` value in `content_blocks`.
 *
 * `page-builder` renders from this map and `registerComponents.ts` registers
 * from it, so a block type cannot be rendered without also being registered for
 * re-rendering.
 */
export const blockMap: Record<string, Component> = {
	hero: HeroBlock,
	features: FeaturesBlock,
	cta: CtaBlock,
};

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
