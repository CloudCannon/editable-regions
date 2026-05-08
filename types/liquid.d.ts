declare module "@cloudcannon/editable-regions/liquid" {
	import type { Liquid } from "liquidjs";

	interface LiquidConfig {
		componentDirs?: string[];
	}

	export function setVerbose(value: boolean): void;
	export function log(...args: any[]): void;
	export function group(label?: string): void;
	export function groupEnd(): void;

	export function createSharedLiquidEngine(options?: Record<string, any>): void;
	export function registerLiquidComponent(key: string, contents: string): void;
	export function initComponentProxy(): void;

	export function createIncludeWithTag(liquidEngine: Liquid): {
		parse(tagToken: any): void;
		render(context: any): Promise<string>;
	};

	export function registerCustomFilter(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerMirroredFilters(
		filters: Record<string, (...args: any[]) => any>,
	): void;
	export function registerCustomShortcode(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerMirroredShortcodes(
		shortcodes: Record<string, (...args: any[]) => any>,
	): void;
	export function registerCustomPairedShortcode(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerMirroredPairedShortcodes(
		pairedShortcodes: Record<string, (...args: any[]) => any>,
	): void;
	export function registerCustomTag(
		name: string,
		factory: (liquidEngine: Liquid) => any,
	): void;
}

/** Window globals used by the liquid integration */
declare global {
	interface Window {
		/** Registered liquid components keyed by name */
		cc_components?: Record<
			string,
			(props: Record<string, any>) => Promise<HTMLElement>
		>;
		/** Liquid template files keyed by path */
		cc_files?: Record<string, string>;
	}
}

export {};
