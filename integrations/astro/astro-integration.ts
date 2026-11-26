import "../../helpers/globals.js";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import {
	type AstroCollectionsMode,
	getAstroCollectionsMode,
} from "./modules/collections-mode.js";

type TransformHook = (this: any, source: any, id: any, options: any) => any;

type BuildPlugin = {
	name?: string;
	transform?: TransformHook | { handler?: TransformHook };
};

const SUPPORTED_VIRTUAL_MODULES: string[] = ["assets", "content"];

function wrapTransform(original: TransformHook): TransformHook {
	return function (source, id, options) {
		if (this.environment?.name === "client") {
			const environment = this.environment;
			const proxy = new Proxy(this, {
				get(target, prop) {
					if (prop === "environment") {
						return {
							...environment,
							name: "ssr",
							config: new Proxy(environment.config, {
								get(config, key) {
									// Astro 7.4.9+ checks config.consumer instead of name.
									if (key === "consumer") return "server";
									return Reflect.get(config, key);
								},
							}),
						};
					}
					return Reflect.get(target, prop);
				},
			});
			return original.call(proxy, source, id, { ...options, ssr: true });
		}
		return original.call(this, source, id, options);
	};
}

// Vite 5 has no environments, so we install this plugin only for the client
// build in `astro:build:setup`. Every transform in that build is a client
// transform, so always run Astro's build transform in SSR mode.
function wrapClientBuildTransform(original: TransformHook): TransformHook {
	return function (source, id, options) {
		return original.call(this, source, id, { ...options, ssr: true });
	};
}

function findAstroBuildPlugin(plugins: unknown): BuildPlugin | undefined {
	const flatPlugins = (plugins as any[])?.flat?.(10);
	return flatPlugins?.find((obj) => {
		return (
			obj &&
			typeof obj === "object" &&
			"name" in obj &&
			obj.name === "astro:build"
		);
	});
}

function wrapAstroBuildPlugin(
	plugin: BuildPlugin | undefined,
	wrap: (original: TransformHook) => TransformHook,
): void {
	if (!plugin || !("transform" in plugin)) return;

	const transform = plugin.transform;
	if (
		typeof transform === "object" &&
		transform &&
		"handler" in transform &&
		typeof transform.handler === "function"
	) {
		transform.handler = wrap(transform.handler);
	} else if (typeof transform === "function") {
		plugin.transform = wrap(transform);
	}
}

function resolveAstroModule(id: string): string | undefined {
	if (!id.startsWith("astro:")) return;

	const type = id
		.replace("astro:", "")
		.replace("/client", "")
		.replace("/server", "");

	let dir = "";
	if (typeof __dirname !== "undefined") {
		dir = __dirname;
	} else {
		dir = dirname(fileURLToPath(import.meta.url));
	}

	if (type === "env" && id.endsWith("/server")) {
		return join(dir, "modules", "secrets.js");
	}

	if (!SUPPORTED_VIRTUAL_MODULES.includes(type)) {
		return;
	}

	return join(dir, "modules", `${type}.js`);
}

const resolveId = { order: "pre" as const, handler: resolveAstroModule };

function createLegacyClientPlugin() {
	return {
		enforce: "pre" as const,
		name: "vite-plugin-editable-regions",
		resolveId,
	};
}

function createEnvironmentPlugin(collectionsMode: AstroCollectionsMode) {
	return {
		enforce: "pre" as const,
		name: "vite-plugin-editable-regions",
		applyToEnvironment(environment: { name: string }) {
			return environment.name === "client";
		},
		config(config: any) {
			config.environments ??= {};

			config.environments.ssr ??= {};
			config.environments.ssr.define ??= {};
			config.environments.ssr.define.ENV_CLIENT = false;

			config.environments.astro ??= {};
			config.environments.astro.define ??= {};
			config.environments.astro.define.ENV_CLIENT = false;

			config.environments.prerender ??= {};
			config.environments.prerender.define ??= {};
			config.environments.prerender.define.ENV_CLIENT = false;

			config.environments.client ??= {};
			config.environments.client.define ??= {};
			config.environments.client.define.ENV_CLIENT = true;
			config.environments.client.define.__EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__ =
				JSON.stringify(collectionsMode);
		},
		configResolved(config: any) {
			wrapAstroBuildPlugin(findAstroBuildPlugin(config.plugins), wrapTransform);
		},
		resolveId,
	};
}

function viteMajorFrom(requireFn: NodeRequire): number | undefined {
	try {
		const { version } = requireFn("vite/package.json") as { version?: string };
		const major = Number.parseInt(version?.split(".")[0] ?? "", 10);
		return Number.isNaN(major) ? undefined : major;
	} catch {
		return undefined;
	}
}

function detectViteMajor(root: URL): number | undefined {
	try {
		const projectRequire = createRequire(new URL("package.json", root));
		try {
			const major = viteMajorFrom(
				createRequire(projectRequire.resolve("astro/package.json")),
			);
			if (major !== undefined) return major;
		} catch {
			// Astro may not expose package.json; try the project's own resolution.
		}
		return viteMajorFrom(projectRequire);
	} catch {
		return undefined;
	}
}

// Astro 4 reports `legacy: {}`; Astro 5+ adds collection flags. This is only a
// fallback for when Vite cannot be resolved from the project.
function hasViteEnvironmentConfig(legacy: unknown): boolean {
	if (!legacy || typeof legacy !== "object") return false;
	return "collections" in legacy || "collectionsBackwardsCompat" in legacy;
}

export default (): AstroIntegration => {
	let useLegacyVite = false;
	let collectionsMode: AstroCollectionsMode = "legacy";

	return {
		name: "editable-regions",
		hooks: {
			"astro:config:setup": ({ config, updateConfig }) => {
				collectionsMode = getAstroCollectionsMode(config.legacy);

				const viteMajor = detectViteMajor(config.root);
				useLegacyVite =
					viteMajor !== undefined
						? viteMajor < 6
						: !hasViteEnvironmentConfig(config.legacy);

				if (useLegacyVite) {
					// Vite 5 has one define map for every build. Default to the
					// server value and override it for the client build below.
					updateConfig({
						vite: {
							define: {
								ENV_CLIENT: false,
							},
						},
					});
					return;
				}

				updateConfig({
					vite: {
						plugins: [createEnvironmentPlugin(collectionsMode)],
					},
				});
			},
			"astro:build:setup": ({ target, vite }) => {
				if (!useLegacyVite || target !== "client") return;

				vite.define ??= {};
				vite.define.ENV_CLIENT = true;
				vite.define.__EDITABLE_REGIONS_ASTRO_COLLECTIONS_MODE__ =
					JSON.stringify(collectionsMode);

				vite.plugins ??= [];
				wrapAstroBuildPlugin(
					findAstroBuildPlugin(vite.plugins),
					wrapClientBuildTransform,
				);
				vite.plugins.unshift(createLegacyClientPlugin());
			},
		},
	};
};
