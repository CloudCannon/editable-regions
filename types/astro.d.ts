/// <reference path="./cloudcannon.d.ts" />

declare module "@cloudcannon/editable-regions/astro-integration" {
	import type { AstroIntegration } from "astro";

	export default function (): AstroIntegration;
}

declare module "@cloudcannon/editable-regions/astro" {
	export function registerAstroComponent(key: string, component: unknown): void;
	export function addFrameworkRenderer(renderer: any): void;
	export function queueForClientSideRender(
		renderFunction: (node: Element) => void,
	): number;
}

declare module "@cloudcannon/editable-regions/astro-react-renderer" {
	// Side-effect only module that registers React renderer
}
