<script>
	import "../assets/site.css";
	import { onMount } from "svelte";

	import { EditableRegions } from "@cloudcannon/editable-regions/svelte";
	import SiteHeader from "$lib/components/SiteHeader.svelte";
	import SiteFooter from "$lib/components/SiteFooter.svelte";

	// Every editable region must sit inside this one EditableRegions root — regions outside it connect as orphans at scan time and can mutate the DOM pre-hydration.

	let { children } = $props();

	onMount(() => {
		// CloudCannon sets this inside the Visual Editor iframe. Keeping the import
		// dynamic and gated means the registration code — and every component it
		// pulls in — stays out of the production bundle entirely.
		if (!window.inEditorMode) {
			return;
		}

		import("$lib/cloudcannon/registerComponents").catch((error) => {
			console.warn("Failed to load CloudCannon component registration:", error);
		});
	});
</script>

<EditableRegions tag="div">
	<SiteHeader />
	<main>
		{@render children()}
	</main>
	<SiteFooter />
</EditableRegions>
