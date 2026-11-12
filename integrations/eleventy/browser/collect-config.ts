import {
	registerCustomTag,
	registerFilter,
	registerPairedShortcode,
	registerShortcode,
} from "../../liquid/index.js";
import { warnOnce } from "../../liquid/logger.js";
import { createInertValue } from "./inert.js";
import {
	builtinFilterNames,
	builtinShortcodeNames,
} from "./liquid-builtins.js";
import { setStubsStrict } from "./stub-mode.js";

type HelperKind = "filters" | "shortcodes" | "pairedShortcodes" | "tags";

type HelperLayer = Record<HelperKind, Map<string, any>>;

type ConfigFunction = (config: any, opts?: any) => any;

type MirrorOptions = { skip?: Partial<Record<HelperKind, string[]>> };

const KIND_REGISTRARS: Record<HelperKind, (name: string, fn: any) => void> = {
	filters: registerFilter,
	shortcodes: registerShortcode,
	pairedShortcodes: registerPairedShortcode,
	tags: registerCustomTag,
};

/** Liquid-specific methods win over universal ones on a name collision. */
const METHOD_TARGETS: Record<string, [HelperKind, "universal" | "liquid"]> = {
	addFilter: ["filters", "universal"],
	addAsyncFilter: ["filters", "universal"],
	addLiquidFilter: ["filters", "liquid"],
	addShortcode: ["shortcodes", "universal"],
	addAsyncShortcode: ["shortcodes", "universal"],
	addLiquidShortcode: ["shortcodes", "liquid"],
	addPairedShortcode: ["pairedShortcodes", "universal"],
	addPairedAsyncShortcode: ["pairedShortcodes", "universal"],
	addPairedLiquidShortcode: ["pairedShortcodes", "liquid"],
	addLiquidTag: ["tags", "liquid"],
};

function resolvePluginFunction(plugin: any): ConfigFunction | null {
	if (typeof plugin === "function") return plugin;
	if (typeof plugin?.configFunction === "function")
		return plugin.configFunction;
	return null;
}

function createEmptyLayer(): HelperLayer {
	return {
		filters: new Map(),
		shortcodes: new Map(),
		pairedShortcodes: new Map(),
		tags: new Map(),
	};
}

export function collectAndRegisterEleventyHelpers(
	config: unknown,
	options: MirrorOptions = {},
): Promise<void> {
	// `finally` so a mirror that failed still leaves render-time stub calls throwing.
	return mirrorConfig(config, options).finally(setStubsStrict);
}

async function mirrorConfig(
	config: unknown,
	options: MirrorOptions,
): Promise<void> {
	const configFn: ConfigFunction | undefined =
		typeof config === "function"
			? (config as ConfigFunction)
			: (config as any)?.default;

	if (typeof configFn !== "function") {
		warnOnce(
			"eleventy-config-shape",
			"Could not auto-mirror Eleventy config helpers: the config's default " +
				"export isn't a function. Filters/shortcodes defined in the config " +
				"won't be available in live editing.",
		);
		return;
	}

	const skip: Record<HelperKind, Set<string>> = {
		filters: new Set([...builtinFilterNames, ...(options.skip?.filters ?? [])]),
		shortcodes: new Set([
			...builtinShortcodeNames,
			...(options.skip?.shortcodes ?? []),
		]),
		pairedShortcodes: new Set(options.skip?.pairedShortcodes ?? []),
		tags: new Set(options.skip?.tags ?? []),
	};

	const layers = { universal: createEmptyLayer(), liquid: createEmptyLayer() };

	const recorder: Record<string, any> = {};
	for (const [method, [kind, layer]] of Object.entries(METHOD_TARGETS)) {
		recorder[method] = (name: string, helperFn: any) => {
			if (typeof name === "string" && typeof helperFn === "function") {
				layers[layer][kind].set(name, helperFn);
			}
		};
	}

	const unrecorded = createInertValue();
	const configRecorder = new Proxy(recorder, {
		get(target, prop, receiver) {
			if (prop in target) return Reflect.get(target, prop, receiver);
			// A thenable-looking recorder would hang `pendingPlugins`.
			if (prop === "then" || typeof prop === "symbol") return undefined;
			return unrecorded;
		},
	});

	const pendingPlugins: Promise<void>[] = [];

	recorder.addPlugin = (plugin: any, opts?: any) => {
		const pluginFn = resolvePluginFunction(plugin);
		if (!pluginFn) return;

		try {
			const result = pluginFn(configRecorder, opts);
			if (typeof result?.then === "function") {
				pendingPlugins.push(Promise.resolve(result).catch(() => {}));
			}
		} catch {
			// Keep helpers registered before the throw.
		}
	};

	let replayFailed = false;

	try {
		await configFn(configRecorder);
		while (pendingPlugins.length > 0) {
			await Promise.all(pendingPlugins.splice(0));
		}
	} catch (err) {
		replayFailed = true;
		warnOnce(
			"eleventy-config-replay",
			"Replaying the Eleventy config to mirror its helpers threw: " +
				`${err instanceof Error ? err.message : err}. Some filters/` +
				"shortcodes may be unavailable in live editing — define a browser " +
				"override via `pluginOptions.liquid.<kind>` for any that are needed.",
		);
	}

	let mirroredCount = 0;

	for (const kind of Object.keys(KIND_REGISTRARS) as HelperKind[]) {
		const register = KIND_REGISTRARS[kind];
		const merged = new Map([...layers.universal[kind], ...layers.liquid[kind]]);
		mirroredCount += merged.size;

		for (const [name, helperFn] of merged) {
			if (skip[kind].has(name)) continue;
			try {
				register(name, helperFn);
			} catch (err) {
				warnOnce(
					`eleventy-mirror:${kind}:${name}`,
					`Failed to mirror Eleventy ${kind} "${name}" into live editing: ` +
						`${err instanceof Error ? err.message : err}.`,
				);
			}
		}
	}

	// Surfaces as an unrelated "unknown filter" error otherwise.
	if (
		mirroredCount === 0 &&
		!replayFailed &&
		configFn.constructor?.name === "AsyncFunction"
	) {
		warnOnce(
			"eleventy-async-config",
			"Your Eleventy config is async and registered no helpers when replayed " +
				"for live editing. If it defines filters/shortcodes they won't be " +
				"available — define a browser override via " +
				"`pluginOptions.liquid.<kind>` for any that are needed.",
		);
	}
}
