import { dirname, join } from "node:path";

const SUPPORTED_VIRTUAL_MODULES = [
	"actions",
	"assets",
	"content",
	"i18n",
	"middleware",
	"transitions",
];

/**
 * @return {import("astro").AstroIntegration}
 */
export default () => {
	/** @type {import("astro").AstroConfig} */
	let astroConfig;

	return {
		name: "editable-regions",
		hooks: {
			"astro:config:setup": ({ config }) => {
				astroConfig = config;
			},
			"astro:build:setup": async ({ target, vite }) => {
				if (target === "client") {
					vite.define ??= {};
					vite.define.ENV_CLIENT = true;

					vite.plugins?.unshift({
						name: "vite-plugin-editable-regions",
						enforce: "pre",

						resolveId(id) {
							if (id.startsWith("astro:")) {
								const type = id
									.replace("astro:", "")
									.replace("/client", "")
									.replace("/server", "");

								if (type === "env") {
									return "\0editable-region:env";
								}

								if (!SUPPORTED_VIRTUAL_MODULES.includes(type)) {
									return;
								}

								let dir = "";
								if (typeof __dirname !== "undefined") {
									dir = __dirname;
								} else {
									dir = dirname(import.meta.url);
								}

								const path = join(dir, "modules", `${type}.js`).replace(
									"file:",
									"",
								);

								return path;
							}
						},

						load(id) {
							if (id === "\0editable-region:env") {
								let contents = "";
								Object.entries(astroConfig?.env?.schema ?? {}).forEach(
									([key, schema]) => {
										if (
											schema.context !== "client" ||
											schema.access !== "public"
										) {
											return;
										}

										try {
											switch (schema.type) {
												case "boolean":
													contents += `export const ${key} = ${!!process.env[key]};\n`;
													break;
												case "number":
													contents += `export const ${key} = ${Number(process.env[key])};\n`;
													break;
												default:
													contents += `export const ${key} = ${JSON.stringify(process.env[key] ?? "")};\n`;
											}
										} catch (e) {
											//Error intentionally ignored
										}
									},
								);
								contents +=
									'export const getSecret = () => console.log("[CloudCannon] getSecret is not supported in an editable component. Please use an editing fallback instead.");';
								return contents;
							}
						},
					});
				} else {
					vite.define ??= {};
					vite.define.ENV_CLIENT = false;
				}
			},
		},
	};
};
