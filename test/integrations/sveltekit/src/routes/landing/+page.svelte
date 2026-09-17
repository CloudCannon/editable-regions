<script>
	import CallToAction from "$lib/components/CallToAction.svelte";
	import FaqList from "$lib/components/FaqList.svelte";
	import FeatureGrid from "$lib/components/FeatureGrid.svelte";
	import HeroSection from "$lib/components/HeroSection.svelte";
	import PricingTable from "$lib/components/PricingTable.svelte";
	import TestimonialCard from "$lib/components/TestimonialCard.svelte";
	import cta from "../../../data/cta.json";
	import { getPage } from "$lib/content";

	const page = getPage("landing");
</script>

<svelte:head>
	<title>{page.data.title} — SvelteKit harness</title>
</svelte:head>

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

	<section class="section">
		<div data-editable="text" data-type="block" data-prop="@content">
			{@html page.html}
		</div>
	</section>

	<editable-component data-component="call-to-action" data-prop="@data[cta]">
		<CallToAction {...cta} />
	</editable-component>
</div>
