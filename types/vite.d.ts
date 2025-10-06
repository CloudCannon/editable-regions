declare module "*?inline" {
	const content: string;
	export default content;
}

declare module "*.astro" {
	const component: any;
	export default component;
}
