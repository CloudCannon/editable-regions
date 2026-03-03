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
						define: {
							ENV_CLIENT: false,
						},
					},
				});
			},
			"astro:build:setup": async ({ target, vite }) => {
				if (target === "client") {
					vite.plugins ??= [];
					vite.define ??= {};
					vite.define.ENV_CLIENT = true;

					const flatPlugins = vite.plugins?.flat(10);
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
						typeof astroBuildPlugin.transform === "function"
					) {
						const original = astroBuildPlugin.transform;
						astroBuildPlugin.transform = function (source, id, options) {
							return original.bind(this)(source, id, { ...options, ssr: true });
						};
					}

					vite.plugins.unshift({
						name: "vite-plugin-editable-regions",
						enforce: "pre",

						resolveId(id) {
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
					});
				}
			},
		},
	};
};
