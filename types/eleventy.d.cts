interface LiquidOptions {
	extensions?: string[];
	ignoreDirectories?: string[];
	componentOverrides?: Record<string, string>;
	filters?: Record<string, string>;
	shortcodes?: Record<string, string>;
	pairedShortcodes?: Record<string, string>;
	tags?: Record<string, string>;
}

interface PluginOptions {
	output?: string;
	verbose?: boolean;
	liquid?: LiquidOptions;
}

declare function editableRegions(
	eleventyConfig: any,
	pluginOptions: PluginOptions,
): void;
export = editableRegions;
