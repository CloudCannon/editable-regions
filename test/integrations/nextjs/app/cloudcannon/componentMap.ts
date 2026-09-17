import type { ComponentType } from "react";

import CallToAction from "../components/CallToAction";
import FaqList from "../components/FaqList";
import FeatureCard from "../components/FeatureCard";
import FeatureGrid from "../components/FeatureGrid";
import HeroSection from "../components/HeroSection";
import PricingTable from "../components/PricingTable";
import StaticPanel from "../components/StaticPanel";
import StatefulCounter from "../components/StatefulCounter";
import TestimonialCard from "../components/TestimonialCard";
import CtaBlock from "../components/blocks/CtaBlock";
import FeaturesBlock from "../components/blocks/FeaturesBlock";
import HeroBlock from "../components/blocks/HeroBlock";

/**
 * Page-builder blocks, keyed by the `_type` value in `content_blocks`.
 *
 * `page-builder/page.tsx` renders from this map and `registerComponents.ts`
 * registers from it, so a block type cannot be rendered without also being
 * registered for re-rendering.
 */
export const blockMap: Record<string, ComponentType<any>> = {
	hero: HeroBlock,
	features: FeaturesBlock,
	cta: CtaBlock,
};

export const componentMap: Record<string, ComponentType<any>> = {
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
