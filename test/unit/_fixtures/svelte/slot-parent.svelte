<script>
import SlotShell from "./slot-shell.svelte";

// Svelte component that composes with SlotShell, passing snippet content
// to the child. Used by `svelte/slots` to assert that a registered
// component can pass children to a child component.
</script>

<div class="slot-parent">
	<SlotShell>
		<p class="slotted">slotted from parent</p>
	</SlotShell>
</div>
