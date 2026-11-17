import "../../helpers/globals.js";
import type { Snippet } from "svelte";
import { createRawSnippet } from "svelte";
import { addFrameworkRenderer, queueForClientSideRender } from "./index.js";

type Mount = (
	component: any,
	args: { target: HTMLElement; props: any },
) => void;

let mount: Mount | undefined;
let flushSync!: () => void;
try {
	({ mount, flushSync } = await import("svelte"));
} catch {
	// Svelte 4 — no mount export
}

addFrameworkRenderer({
	name: "@astrojs/svelte",
	clientEntrypoint: "@astrojs/svelte/client.js",
	ssr: {
		check: (Component) => {
			if (typeof Component !== "function") return false;

			// Svelte 5: compiled components reference $$payload or $$renderer
			const str = Component.toString();
			if (
				str.includes("$$payload") ||
				str.includes("$$renderer") ||
				str.includes("$$anchor")
			) {
				return true;
			}

			if (typeof Component.render === "function") {
				return true;
			}

			return false;
		},
		renderToStaticMarkup: async (
			Component,
			props,
			slots,
			metadata,
		): Promise<{ html: string }> => {
			const renderProps: Record<string, any> = {};
			let $$slots: Record<string, any> | undefined;
			let children: Snippet | undefined;
			for (const [key, value] of Object.entries(slots)) {
				$$slots ??= {};
				if (key === "default") {
					$$slots.default = true;
					children = createRawSnippet(() => ({
						render: () => value,
					}));
				} else {
					$$slots[key] = createRawSnippet(() => ({
						render: () => value,
					}));
				}
				const slotName = key === "default" ? "children" : key;
				renderProps[slotName] = createRawSnippet(() => ({
					render: () => value,
				}));
			}

			const newProps = {
				...props,
				children,
				$$slots,
				...renderProps,
			};

			if (metadata?.hydrate) {
				const id = queueForClientSideRender((node) => {
					if (mount) {
						mount(Component, {
							target: node as HTMLElement,
							props: newProps,
						});
					} else {
						new Component({
							target: node,
							props: newProps,
						});
					}

					flushSync();
				});

				return {
					html: `<div data-editable-region-csr-id=${id}></div>`,
				};
			}

			const doc = document.implementation.createHTMLDocument();
			if (mount) {
				mount(Component, {
					target: doc.body,
					props: newProps,
				});
			} else {
				new Component({
					target: doc.body,
					props: newProps,
				});
			}

			flushSync();

			return { html: doc.body.innerHTML };
		},
	},
});
