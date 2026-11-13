import type { Liquid } from "liquidjs";
import type { LiquidTagImpl } from "../liquid/tag-types.js";

export interface LiquidOptions {
	/** Defaults to `[directories.includes, directories.input]`. */
	componentDirs?: string[];
	/** Defaults to `[".liquid", ".html"]`. */
	extensions?: string[];
	/** Defaults to `[directories.output, "node_modules"]`. */
	ignoreDirectories?: string[];
	components?: Record<string, string>;
	/** Path resolution is relative to the project root. */
	configPath?: string;
	browserStub?: string[];
	/** Overrides the mirrored helper and excludes its name from the mirror. */
	filters?: Record<string, string>;
	shortcodes?: Record<string, string>;
	pairedShortcodes?: Record<string, string>;
	/** Module must default-export a `(engine) => { parse, render }` factory. */
	tags?: Record<string, string>;
}

export interface PluginOptions {
	/** Defaults to `register-components.js` inside Eleventy's `dir.output`. */
	output?: string;
	verbose?: boolean;
	liquid?: LiquidOptions | boolean;
	/** Embedded at build time, so values must be JSON-serialisable — don't include secrets. */
	globals?: Record<string, unknown>;
}

export type NormalizedPluginOptions = Omit<PluginOptions, "liquid"> & {
	liquid: LiquidOptions | false;
};

export interface EleventyDirectories {
	input: string;
	includes: string;
	data: string;
	output: string;
}

export interface EleventyEventPayload {
	directories?: EleventyDirectories;
	dir?: EleventyDirectories;
	results?: EleventyResult[];
}

export interface EleventyResult {
	inputPath?: string;
	outputPath?: string;
	url?: string;
}

export type LiquidTagFactory = (liquidEngine: Liquid) => LiquidTagImpl;

export type EleventyEventName =
	| "eleventy.before"
	| "eleventy.after"
	| "eleventy.beforeWatch"
	| "eleventy.beforeConfig";

export interface EleventyConfig {
	addLiquidTag: (name: string, factory: LiquidTagFactory) => void;
	on: (
		event: EleventyEventName,
		handler: (payload: EleventyEventPayload) => Promise<void> | void,
	) => void;
	dir: EleventyDirectories;
}
