import CallToAction from "../components/CallToAction";
import FaqList from "../components/FaqList";
import FeatureGrid from "../components/FeatureGrid";
import HeroSection from "../components/HeroSection";
import PricingTable from "../components/PricingTable";
import TestimonialCard from "../components/TestimonialCard";
import cta from "../../data/cta.json";
import { getPage } from "../utils/content";

/**
 * The only page composed like a real site — everything else isolates one
 * feature. This one is the density/interaction test.
 */
const page = getPage("landing");

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function LandingPage() {
	return (
		<div>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{page.data.title}
			</h1>

			<editable-component data-component="hero-section" data-prop="hero">
				<HeroSection {...page.data.hero} />
			</editable-component>

			<editable-component data-component="feature-grid" data-prop="feature_grid">
				<FeatureGrid {...page.data.feature_grid} />
			</editable-component>

			<editable-component data-component="testimonial" data-prop="testimonial">
				<TestimonialCard {...page.data.testimonial} />
			</editable-component>

			<editable-component data-component="pricing-table" data-prop="pricing">
				<PricingTable {...page.data.pricing} />
			</editable-component>

			<editable-component data-component="faq-list" data-prop="faq">
				<FaqList {...page.data.faq} />
			</editable-component>

			<section className="section">
				<div
					data-editable="text"
					data-type="block"
					data-prop="@content"
					dangerouslySetInnerHTML={{ __html: page.html }}
				/>
			</section>

			{/* A data-file-backed component region on a page otherwise driven by frontmatter. */}
			<editable-component data-component="call-to-action" data-prop="@data[cta]">
				<CallToAction {...cta} />
			</editable-component>
		</div>
	);
}
