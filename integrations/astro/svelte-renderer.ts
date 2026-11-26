import "../../helpers/globals.js";
import type { Snippet } from "svelte";
import * as svelte from "svelte";
import { addFrameworkRenderer, queueForClientSideRender } from "./index.js";

type Svelte5Runtime = {
	mount: (
		component: any,
		options: { target: HTMLElement; props: Record<string, any> },
	) => unknown;
	flushSync: () => void;
	createRawSnippet: (fn: () => { render: () => string }) => Snippet;
};

type RenderResult = { html: string };
type Slots = Record<string, string>;

// Svelte 3/4 don't export the Svelte 5 runtime APIs.
const svelteRuntime = svelte as unknown as Partial<Svelte5Runtime>;
const svelte5: Svelte5Runtime | undefined =
	typeof svelteRuntime.mount === "function" &&
	typeof svelteRuntime.flushSync === "function" &&
	typeof svelteRuntime.createRawSnippet === "function"
		? {
				mount: svelteRuntime.mount,
				flushSync: svelteRuntime.flushSync,
				createRawSnippet: svelteRuntime.createRawSnippet,
			}
		: undefined;

/**
 * Svelte 4 has no public API for constructing a slot from an HTML string.
 * A slot definition is `[slotFn, ...]`, where `slotFn` returns a fragment with
 * `c`/`m`/`p`/`d` lifecycle methods. This fragment mounts already-rendered
 * HTML at the slot's position in the component.
 */
class LegacySlotFragment {
	private nodes: Node[] = [];

	constructor(private readonly html: string) {}

	c() {}

	l() {}

	m(target: Element, anchor: Node | null) {
		const template = document.createElement("template");
		template.innerHTML = this.html;
		this.nodes = Array.from(template.content.childNodes);
		for (const node of this.nodes) {
			target.insertBefore(node, anchor);
		}
	}

	p() {}

	d(detaching: boolean) {
		if (!detaching) return;
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		this.nodes = [];
	}
}

const legacySlot = (html: string): unknown[] => [
	() => new LegacySlotFragment(html),
	() => {},
	() => {},
];

function renderWithMetadata(
	render: (target: HTMLElement) => void,
	metadata: { hydrate?: unknown } | undefined,
): RenderResult {
	if (metadata?.hydrate) {
		const id = queueForClientSideRender((node) => render(node as HTMLElement));
		return { html: `<div data-editable-region-csr-id=${id}></div>` };
	}

	const doc = document.implementation.createHTMLDocument();
	render(doc.body);
	return { html: doc.body.innerHTML };
}

function renderSvelte5ToStaticMarkup(
	runtime: Svelte5Runtime,
	Component: any,
	props: Record<string, any>,
	slots: Slots,
	metadata: { hydrate?: unknown } | undefined,
): RenderResult {
	const renderProps: Record<string, any> = {};
	let $$slots: Record<string, any> | undefined;
	let children: Snippet | undefined;

	for (const [key, value] of Object.entries(slots)) {
		const slot = runtime.createRawSnippet(() => ({ render: () => value }));
		const slotName = key === "default" ? "children" : key;

		$$slots ??= {};
		if (key === "default") {
			$$slots.default = true;
			children = slot;
		} else {
			$$slots[key] = slot;
		}
		renderProps[slotName] = slot;
	}

	const newProps = { ...props, children, $$slots, ...renderProps };

	return renderWithMetadata((target) => {
		runtime.mount(Component, { target, props: newProps });
		runtime.flushSync();
	}, metadata);
}

function renderSvelte4ToStaticMarkup(
	Component: any,
	props: Record<string, any>,
	slots: Slots,
	metadata: { hydrate?: unknown } | undefined,
): RenderResult {
	// Svelte 4 server components take slots directly as string-producing
	// functions and render their own markup.
	if (
		typeof Component.render === "function" &&
		typeof Component.$$render === "function"
	) {
		const $$slots: Record<string, () => string> = {};
		for (const [key, value] of Object.entries(slots)) {
			$$slots[key] = () => value;
		}

		return { html: Component.render(props, { $$slots }).html };
	}

	const $$slots: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(slots)) {
		$$slots[key] = legacySlot(value);
	}

	const newProps = { ...props, $$slots, $$scope: { ctx: [] } };

	return renderWithMetadata((target) => {
		new Component({ target, props: newProps });
	}, metadata);
}

addFrameworkRenderer({
	name: "@astrojs/svelte",
	clientEntrypoint: "@astrojs/svelte/client.js",
	ssr: {
		check: (Component) => {
			if (typeof Component === "function") {
				// Svelte 5: compiled components reference $$payload or $$renderer
				const str = Component.toString();
				if (
					str.includes("$$payload") ||
					str.includes("$$renderer") ||
					str.includes("$$anchor")
				) {
					return true;
				}

				// Svelte 4 client components expose these on the prototype.
				if (typeof Component.prototype?.$destroy === "function") {
					return true;
				}
			}

			// Svelte 4 server components expose static render functions.
			return (
				typeof Component?.render === "function" &&
				typeof Component?.$$render === "function"
			);
		},
		renderToStaticMarkup: async (
			Component,
			props,
			slots,
			metadata,
		): Promise<RenderResult> => {
			if (svelte5) {
				return renderSvelte5ToStaticMarkup(
					svelte5,
					Component,
					props,
					slots,
					metadata,
				);
			}

			return renderSvelte4ToStaticMarkup(Component, props, slots, metadata);
		},
	},
});
