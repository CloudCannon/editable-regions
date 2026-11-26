import { EditableRegions } from "@cloudcannon/editable-regions/svelte";

// Resolving this under Svelte 3.47 types proves the shipped declaration is
// compatible; `svelte.Component` does not exist before Svelte 4.
export const Svelte3Component = EditableRegions;
