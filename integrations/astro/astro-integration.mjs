import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type{string[]} */
const SUPPORTED_VIRTUAL_MODULES = ["assets", "content"];

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
										const original = astroBuildPlugin.transform.handler;
										astroBuildPlugin.transform.handler = function (
											source,
											id,
											options,
										) {
											if (this.environment.name === "client") {
												/** @type {*} */
												const newThis = {
													...this,
													environment: { ...this.environment, name: "ssr" },
												};

												return original.bind(newThis)(source, id, {
													...options,
													ssr: true,
												});
											} else {
												return original.bind(this)(source, id, options);
											}
										};
									} else if (
										astroBuildPlugin &&
										"transform" in astroBuildPlugin &&
										typeof astroBuildPlugin.transform === "function"
									) {
										const original = astroBuildPlugin.transform;
										astroBuildPlugin.transform = function (
											source,
											id,
											options,
										) {
											if (this.environment.name === "client") {
												/** @type {*} */
												const newThis = {
													...this,
													environment: { ...this.environment, name: "ssr" },
												};

												return original.bind(newThis)(source, id, {
													...options,
													ssr: true,
												});
											} else {
												return original.bind(this)(source, id, options);
											}
										};
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
