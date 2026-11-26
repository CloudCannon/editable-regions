<script>
	import { onDestroy, onMount } from "svelte";

	export let tag = "div";

	let editable = null;
	let element;
	let pendingLoadHandler = null;

	// `data-prop` and `data-literal` are controlled here; user-supplied ones are dropped.
	$: restProps = filterProps($$restProps);

	function filterProps(props) {
		const filtered = {};
		for (const [name, value] of Object.entries(props)) {
			if (/^data-(prop|literal)/i.test(name)) {
				continue;
			}

			filtered[name] = value;
		}
		return filtered;
	}

	onMount(() => {
		const connectEditable = (regions) => {
			if (!regions || editable || !element) {
				return;
			}

			editable = new regions.Editable(element);
			editable.connect();
		};

		if (window.editableRegions) {
			connectEditable(window.editableRegions);
		} else {
			pendingLoadHandler = () => {
				connectEditable(window.editableRegions);
			};
			document.addEventListener("editable-regions:load", pendingLoadHandler, {
				once: true,
			});
		}
	});

	onDestroy(() => {
		if (pendingLoadHandler) {
			document.removeEventListener("editable-regions:load", pendingLoadHandler);
			pendingLoadHandler = null;
		}

		editable?.disconnect();
		editable = null;
	});
</script>

<svelte:element
	this={tag}
	{...restProps}
	bind:this={element}
	data-editable="_dynamic"
	data-prop=""
>
	<slot />
</svelte:element>
