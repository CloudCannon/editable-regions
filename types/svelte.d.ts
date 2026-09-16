/// <reference path="./cloudcannon.d.ts" />

import type { SvelteComponentTyped } from "svelte";

export function registerSvelteComponent(key: string, component: unknown): void;

export const EditableRegions: import("svelte").ComponentType<
	SvelteComponentTyped<
		{
			tag?: string;
		} & Record<string, any>
	>
>;
