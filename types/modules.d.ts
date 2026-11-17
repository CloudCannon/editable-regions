declare module "astro/runtime/server/index.js" {
	export function renderSlotToString(result: any, slot: any): string;
	export function renderToString(
		result: any,
		component: any,
		props: any,
		slots: any,
	): Promise<string>;
}
