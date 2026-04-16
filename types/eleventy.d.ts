export interface LiquidOptions {
	extensions?: string[];
	ignoreDirectories?: string[];
	componentOverrides?: Record<string, string>;
	filters?: Record<string, string>;
	shortcodes?: Record<string, string>;
	pairedShortcodes?: Record<string, string>;
	tags?: Record<string, string>;
}

export interface PluginOptions {
	output?: string;
	verbose?: boolean;
	liquid?: LiquidOptions;
}

export default function (
	eleventyConfig: any,
	pluginOptions: PluginOptions,
): void;
