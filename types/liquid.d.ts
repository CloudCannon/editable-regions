declare module "@cloudcannon/editable-regions/liquid" {
	import type { Liquid } from "liquidjs";

	interface LiquidConfig {
		componentDirs?: string[];
	}

	export function setVerbose(value: boolean): void;
	export function log(...args: any[]): void;
	export function group(label?: string): void;
	export function groupEnd(): void;

	export function configureLiquid(options: LiquidConfig): void;
	export function getLiquidEngine(options?: Record<string, any>): Liquid;
	export function registerLiquidComponent(key: string, contents: string): void;

	export function createBindIncludeTag(liquidEngine: Liquid): {
		parse(tagToken: any): void;
		render(context: any): Promise<string>;
	};

	export function registerCustomFilter(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerCustomShortcode(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerCustomPairedShortcode(
		name: string,
		fn: (...args: any[]) => any,
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
