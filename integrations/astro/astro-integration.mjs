import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type{string[]} */
const SUPPORTED_VIRTUAL_MODULES = ["assets", "content"];

function wrapTransform(original) {
	return function (source, id, options) {
		if (this.environment?.name === "client") {
			const proxy = new Proxy(this, {
				get(target, prop) {
					if (prop === "environment") {
						return { ...target.environment, name: "ssr" };
					}
					return Reflect.get(target, prop);
				},
			});
			return original.call(proxy, source, id, { ...options, ssr: true });
		}
		return original.call(this, source, id, options);
	};
}

/**
 * @return {import("astro").AstroIntegration}
 */
export default () => {
	return {
		name: "editable-regions",
		hooks: {
			"astro:config:setup": ({ updateConfig }) => {
				updateConfig({
					vite: {
						plugins: [
							{
								enforce: "pre",
								name: "vite-plugin-editable-regions",
								applyToEnvironment(environment) {
									return environment.name === "client";
								},
								config(config) {
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
								},
								configResolved(config) {
									const flatPlugins = config.plugins?.flat(10);
									const astroBuildPlugin = flatPlugins?.find((obj) => {
										return (
											obj &&
											typeof obj === "object" &&
											"name" in obj &&
											obj.name === "astro:build"
										);
									});

									if (
										astroBuildPlugin &&
										"transform" in astroBuildPlugin &&
										typeof astroBuildPlugin.transform === "object" &&
										astroBuildPlugin.transform &&
										"handler" in astroBuildPlugin.transform &&
										typeof astroBuildPlugin.transform.handler === "function"
									) {
										astroBuildPlugin.transform.handler = wrapTransform(
											astroBuildPlugin.transform.handler,
										);
									} else if (
										astroBuildPlugin &&
										"transform" in astroBuildPlugin &&
										typeof astroBuildPlugin.transform === "function"
									) {
										astroBuildPlugin.transform = wrapTransform(
											astroBuildPlugin.transform,
										);
									}
								},
								resolveId: {
									order: "pre",
									handler(id) {
										if (id.startsWith("astro:")) {
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
									},
								},
							},
						],
					},
				});
			},
		},
	};
};
