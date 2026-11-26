import {
	EditableRegions,
	type EditableRegionsProps,
	registerVueComponent,
} from "@cloudcannon/editable-regions/vue";

// Resolving this under Vue 2.7 types proves the shipped declaration is
// compatible with both Vue 2.7's and Vue 3's DefineComponent.
export const component = EditableRegions;

export const props: EditableRegionsProps = {
	tag: "section",
	class: "outer",
};

registerVueComponent("vue2-typecheck", component);
