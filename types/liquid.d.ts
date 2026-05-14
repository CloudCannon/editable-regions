declare module "@cloudcannon/editable-regions/liquid" {
	import type { Liquid, LiquidOptions } from "liquidjs";

	export function setVerbose(value: boolean): void;
	export function log(...args: any[]): void;
	export function group(label?: string): void;
	export function groupEnd(): void;

	export function createSharedLiquidEngine(options?: LiquidOptions): Liquid;
	export function registerLiquidComponent(key: string, contents: string): void;
	export function initComponentProxy(): void;

	export function createIncludeWithTag(liquidEngine: Liquid): {
		parse(tagToken: any): void;
		render(context: any): Promise<string>;
	};

	export function registerFilter(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerShortcode(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerPairedShortcode(
		name: string,
		fn: (...args: any[]) => any,
	): void;
	export function registerCustomTag(
		name: string,
		factory: (liquidEngine: Liquid) => any,
	): void;
	export function registerProcessEnv(env: Record<string, string>): void;
	export function registerEleventyData(data: {
		version: string;
		generator: string;
		env: { runMode: string; source: string };
		directories: Record<string, string>;
	}): void;
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
