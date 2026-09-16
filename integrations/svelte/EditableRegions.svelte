<script>
	import { onDestroy, onMount } from "svelte";

	// Element type to render. Defaults to "div".
	/** @type {string | undefined} */
	export let tag = "div";

	/** @type {any} */
	let editable = null;
	/** @type {HTMLElement | undefined} */
	let element;
	/** @type {(() => void) | null} */
	let pendingLoadHandler = null;

	// data-prop and data-literal attributes are controlled by this component
	// itself; user-supplied ones are ignored.
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
		/**
		 * @param {any} regions
		 */
		const connectEditable = (regions) => {
			if (!regions || editable) {
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
			document.addEventListener(
				"editable-regions:load",
				pendingLoadHandler,
				{ once: true },
			);
		}
	});

	onDestroy(() => {
		if (pendingLoadHandler) {
			document.removeEventListener(
				"editable-regions:load",
				pendingLoadHandler,
			);
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
