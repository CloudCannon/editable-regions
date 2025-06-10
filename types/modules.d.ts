/**
 * Type definitions for external modules and libraries
 */

declare module "astro/runtime/server/index.js" {
	export function renderToString(
		result: any,
		component: any,
		props: any,
		slots: any,
	): Promise<string>;
	export function renderSlotToString(result: any, slot: any): string;
}

declare module "*.astro" {
	export default function render(props: unknown): unknown;
}

declare module "react-dom/server.browser" {
	export function renderToStaticMarkup(element: any): string;
}

declare module "prosemirror-example-setup" {
	export function exampleSetup(options: { schema: any }): any[];
}

declare module "prosemirror-schema-list" {
	export function addListNodes(
		nodes: any,
		paragraph: string,
		block: string,
	): any;
}

declare module "prosemirror-menu/style/menu.css" {
	// CSS module
}

// Make Transaction more flexible
declare global {
	namespace ProseMirror {
		interface Transaction {
			apply?: (state: any) => any;
		}
	}
}
