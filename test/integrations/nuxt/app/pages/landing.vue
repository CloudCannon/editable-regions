<script setup lang="ts">
import cta from "../../data/cta.json";
import { getPage } from "../utils/content";

const page = getPage("landing");

useHead({ title: `${page.data.title} — Vue harness` });
</script>

<template>
	<div>
		<h1 data-editable="text" data-type="span" data-prop="title">
			{{ page.data.title }}
		</h1>

		<editable-component data-component="hero-section" data-prop="hero">
			<HeroSection v-bind="page.data.hero" />
		</editable-component>

		<editable-component data-component="feature-grid" data-prop="feature_grid">
			<FeatureGrid v-bind="page.data.feature_grid" />
		</editable-component>

		<editable-component data-component="testimonial" data-prop="testimonial">
			<TestimonialCard v-bind="page.data.testimonial" />
		</editable-component>

		<editable-component data-component="pricing-table" data-prop="pricing">
			<PricingTable v-bind="page.data.pricing" />
		</editable-component>

		<editable-component data-component="faq-list" data-prop="faq">
			<FaqList v-bind="page.data.faq" />
		</editable-component>

		<section class="section">
			<div
				data-editable="text"
				data-type="block"
				data-prop="@content"
				v-html="page.html"
			/>
		</section>

		<editable-component data-component="call-to-action" data-prop="@data[cta]">
			<CallToAction v-bind="cta" />
		</editable-component>
	</div>
</template>
