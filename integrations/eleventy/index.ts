import "../../helpers/globals.js";
import fs from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild, { type Loader, type Plugin } from "esbuild";
import { createIncludeWithTag } from "../liquid/include-with-tag.js";
import type {
	EleventyConfig,
	EleventyDirectories,
	EleventyEventPayload,
	LiquidOptions,
	NormalizedPluginOptions,
	PluginOptions,
} from "./types.js";

export type {
	LiquidOptions,
	NormalizedPluginOptions,
	PluginOptions,
} from "./types.js";

// Points at the compiled output, so running from source needs a build first.
const BROWSER_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"browser",
);

const PROCESS_SHIM_PATH = path.join(BROWSER_DIR, "process-shim.js");

const STUB_MODE_PATH = path.join(BROWSER_DIR, "stub-mode.js");

export default function editableRegionsPlugin(
	eleventyConfig: EleventyConfig,
	pluginOptions?: PluginOptions,
): void {
	const options = normalizePluginOptions(pluginOptions);

	if (!options.liquid) return;
	const liquidOptions = options.liquid;

	eleventyConfig.addLiquidTag("includeWith", createIncludeWithTag);

	eleventyConfig.on(
		"eleventy.after",
		async ({ directories, dir, results }: EleventyEventPayload) => {
			const dirs = directories ?? dir ?? eleventyConfig.dir;

			const rawExtensions = liquidOptions.extensions ?? [".liquid", ".html"];
			const normalizedExtensions = rawExtensions.map((ext) =>
				ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
			);

			const liveEditingSource = await generateLiveEditingSource(
				options,
				dirs,
				normalizedExtensions,
				results,
			);

			// esbuild only matches the final extension, so .bookshop.liquid -> .liquid
			const loader: Record<string, Loader> = {};
			for (const ext of normalizedExtensions) {
				loader[ext.slice(ext.lastIndexOf("."))] = "text";
			}

			await esbuild.build({
				stdin: {
					contents: liveEditingSource,
					resolveDir: process.cwd(),
				},
				loader,
				bundle: true,
				platform: "browser",
				plugins: [createBrowserStubPlugin(liquidOptions.browserStub)],
				// Node globals aren't imports, so the stub plugin can't reach them.
				inject: [PROCESS_SHIM_PATH],
				outfile: options.output ?? `${dirs.output}/register-components.js`,
			});
		},
	);
}

function normalizePluginOptions(
	pluginOptions: PluginOptions | undefined,
): NormalizedPluginOptions {
	const opts = pluginOptions ?? {};
	return {
		...opts,
		liquid: normalizeLiquidOption(opts.liquid),
	};
}

function normalizeLiquidOption(
	liquid: LiquidOptions | boolean | null | undefined,
): LiquidOptions | false {
	if (liquid === false) return false;

	if (liquid && typeof liquid === "object") return liquid;

	return {};
}

const ALWAYS_STUBBED = ["@cloudcannon/editable-regions/eleventy"];

function createBrowserStubPlugin(extraStubs: string[] = []): Plugin {
	const nodeBuiltins = new Set([
		...builtinModules,
		...builtinModules.map((m) => `node:${m}`),
	]);
	const exactStubs = new Set([...ALWAYS_STUBBED, ...extraStubs]);

	const shouldStub = (id: string): boolean => {
		if (nodeBuiltins.has(id)) return true;

		if (id === "@11ty/eleventy" || id.startsWith("@11ty/eleventy/")) {
			return true;
		}

		return exactStubs.has(id);
	};

	return {
		name: "editable-regions-browser-stub",
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				if (args.path === "process" || args.path === "node:process") {
					return { path: args.path, namespace: "er-process" };
				}
				return shouldStub(args.path)
					? { path: args.path, namespace: "er-stub" }
					: null;
			});
			// CJS so an unmatched named import resolves to undefined, not a build error.
			build.onLoad({ filter: /.*/, namespace: "er-process" }, () => ({
				contents: `module.exports = require(${JSON.stringify(PROCESS_SHIM_PATH)}).process;`,
				loader: "js",
				resolveDir: BROWSER_DIR,
			}));
			build.onLoad({ filter: /.*/, namespace: "er-stub" }, (args) => ({
				contents: `
					const { onStubInvoked } = require(${JSON.stringify(STUB_MODE_PATH)});
					const specifier = ${JSON.stringify(args.path)};
					const handler = {
						get: () => new Proxy(function () {}, handler),
						apply: () => onStubInvoked(specifier, "called"),
						construct: () => onStubInvoked(specifier, "constructed"),
					};
					module.exports = new Proxy(function () {}, handler);
				`,
				loader: "js",
				resolveDir: BROWSER_DIR,
			}));
		},
	};
}

function resolveEleventyConfigPath(
	liquidOptions: LiquidOptions,
): string | null {
	if (liquidOptions.configPath) {
		return path.resolve(process.cwd(), liquidOptions.configPath);
	}
	const defaults = [
		".eleventy.js",
		"eleventy.config.js",
		"eleventy.config.mjs",
		"eleventy.config.cjs",
	];
	for (const name of defaults) {
		const candidate = path.resolve(process.cwd(), name);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function emitConfigMirror(
	configPath: string,
	liquidOptions: LiquidOptions | undefined,
): { imports: string; body: string } {
	const skip = {
		filters: Object.keys(liquidOptions?.filters ?? {}),
		shortcodes: Object.keys(liquidOptions?.shortcodes ?? {}),
		pairedShortcodes: Object.keys(liquidOptions?.pairedShortcodes ?? {}),
		tags: Object.keys(liquidOptions?.tags ?? {}),
	};

	return {
		imports: `\nimport userEleventyConfig from ${JSON.stringify(configPath)};\n`,
		body: `await collectAndRegisterEleventyHelpers(userEleventyConfig, ${JSON.stringify({ skip })});\n`,
	};
}

async function generateLiveEditingSource(
	options: NormalizedPluginOptions,
	directories: EleventyDirectories,
	normalizedExtensions: string[],
	results: EleventyEventPayload["results"],
): Promise<string> {
	let source = "";

	if (options.liquid) {
		const liquidOptions = options.liquid;
		const componentDirs = liquidOptions.componentDirs ?? [
			directories.includes,
			directories.input,
		];
		const ignoreDirectories = liquidOptions.ignoreDirectories ?? [
			directories.output,
			"node_modules",
		];
		const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
			dir.toLowerCase(),
		);

		source += `
      import { createSharedLiquidEngine, registerLiquidComponent, registerFilter, registerShortcode, registerPairedShortcode, registerCustomTag, registerGlobals, registerEleventyData, registerPkg, registerPageMap, initComponentProxy, setVerbose } from '@cloudcannon/editable-regions/liquid';
      import { registerEleventyBuiltins, collectAndRegisterEleventyHelpers } from '@cloudcannon/editable-regions/eleventy/browser';

      setVerbose(${Boolean(options.verbose)});

			const liquidEngine = createSharedLiquidEngine({
				root: ${JSON.stringify(componentDirs)},
				extname: ".liquid",
				strictFilters: true,
			});

			registerEleventyBuiltins(liquidEngine);

    	window.cc_liquid_files = {};
  `;

		if (options.globals && Object.keys(options.globals).length > 0) {
			source += `\nregisterGlobals(${JSON.stringify(options.globals)});\n`;
		}

		const eleventyData = buildEleventyData(directories);
		source += `\nregisterEleventyData(${JSON.stringify(eleventyData)});\n`;

		const pkg = buildPkg();
		if (pkg) {
			source += `\nregisterPkg(${JSON.stringify(pkg)});\n`;
		}

		const pageMap = buildPageMap(results);
		if (Object.keys(pageMap).length > 0) {
			source += `\nregisterPageMap(${JSON.stringify(pageMap)});\n`;
		}

		const allLiquidFiles = await findAllLiquidFiles(
			componentDirs,
			normalizedExtensions,
			normalizedIgnoreDirs,
		);

		for (const [i, filePath] of allLiquidFiles.entries()) {
			const id = `liquidFile_${i}`;
			const importPath = toPosixPath(filePath);
			source += `import ${id} from ${JSON.stringify(`./${importPath}`)};

      window.cc_liquid_files[${JSON.stringify(importPath)}] = ${id};
      `;
		}

		const configPath = resolveEleventyConfigPath(liquidOptions);
		const configMirror = configPath
			? emitConfigMirror(configPath, liquidOptions)
			: { imports: "", body: "" };

		source += configMirror.imports;

		if (!configPath) {
			console.warn(
				"[editable-regions] Could not locate an Eleventy config file to " +
					"auto-mirror helpers from. Set `pluginOptions.liquid.configPath` " +
					"if your config isn't at a default location. Filters/shortcodes " +
					"defined in the config won't be available in live editing " +
					"(overrides still work).",
			);
		}

		// Overrides are excluded from the mirror, so this is each name's only registration.
		const registrations = emitImportRegistrations(liquidOptions);
		source += registrations.imports;

		// One awaited sequence: `window.cc_components` publishes only after the async replay.
		source += `
      async function initLiveEditing() {
        ${configMirror.body}${registrations.body}
        initComponentProxy();
      }

      initLiveEditing();
    `;
	}
	return source;
}

function buildEleventyData(directories: EleventyDirectories) {
	const version = readEleventyVersion();

	return {
		version,
		generator: `Eleventy v${version}`,
		env: {
			runMode: "serve",
			source: "cli",
		},
		directories: {
			input: directories.input,
			includes: directories.includes,
			data: directories.data,
			output: directories.output,
		},
	};
}

function buildPkg(): any {
	try {
		const contents = fs.readFileSync(
			path.join(process.cwd(), "package.json"),
			"utf8",
		);
		return JSON.parse(contents);
	} catch {
		return null;
	}
}

function readEleventyVersion(): string {
	try {
		const require = createRequire(import.meta.url);
		const entryPath = require.resolve("@11ty/eleventy");
		let dir = path.dirname(entryPath);
		while (true) {
			const pkgPath = path.join(dir, "package.json");
			if (fs.existsSync(pkgPath)) {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
					name?: string;
					version?: string;
				};
				if (pkg.name === "@11ty/eleventy" && pkg.version) return pkg.version;
			}
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		return "unknown";
	} catch {
		return "unknown";
	}
}

function buildPageMap(
	results: EleventyEventPayload["results"],
): Record<string, { url?: string; outputPath?: string }> {
	if (!Array.isArray(results)) return {};

	const map: Record<string, { url?: string; outputPath?: string }> = {};

	for (const entry of results) {
		if (!entry || typeof entry.inputPath !== "string") continue;

		const key = entry.inputPath.replace(/^\.\//, "").replace(/^\/+/, "");
		if (!key || key in map) continue;

		map[key] = {
			url: typeof entry.url === "string" ? entry.url : undefined,
			outputPath:
				typeof entry.outputPath === "string" ? entry.outputPath : undefined,
		};
	}

	return map;
}

async function findAllLiquidFiles(
	componentDirs: string[],
	extensions: string[],
	ignoreDirectories: string[],
): Promise<string[]> {
	const allFiles: string[] = [];

	for (const dir of componentDirs) {
		const files = await findFilesInDirectory({
			directory: dir,
			extensions,
			ignoreDirectories,
		});

		allFiles.push(...files);
	}

	return allFiles;
}

function toPosixPath(filePath: string): string {
	return filePath.split(path.sep).join("/");
}

async function findFilesInDirectory({
	directory,
	extensions = [".html", ".liquid"],
	ignoreDirectories = [],
}: {
	directory: string;
	extensions?: string[];
	ignoreDirectories?: string[];
}): Promise<string[]> {
	const files: string[] = [];

	try {
		const entries = await fs.promises.readdir(directory, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				if (ignoreDirectories.includes(entry.name.toLowerCase())) {
					continue;
				}

				const subFiles = await findFilesInDirectory({
					directory: fullPath,
					extensions,
					ignoreDirectories,
				});
				files.push(...subFiles);
			} else if (entry.isFile()) {
				const filenameLower = entry.name.toLowerCase();
				const hasValidExtension = extensions.some((ext) =>
					filenameLower.endsWith(ext),
				);
				if (hasValidExtension) {
					files.push(fullPath);
				}
			}
		}
	} catch (error) {
		console.error("ERROR reading directory:", directory, error);
		throw error;
	}

	return files;
}

const IMPORT_REGISTER_FNS = {
	filters: "registerFilter",
	shortcodes: "registerShortcode",
	pairedShortcodes: "registerPairedShortcode",
	tags: "registerCustomTag",
	components: "registerLiquidComponent",
};

function emitImportRegistrations(liquidOptions: LiquidOptions | undefined): {
	imports: string;
	body: string;
} {
	let imports = "";
	let body = "";

	for (const optionKey of Object.keys(IMPORT_REGISTER_FNS) as Array<
		keyof typeof IMPORT_REGISTER_FNS
	>) {
		const registerFn = IMPORT_REGISTER_FNS[optionKey];

		for (const [i, [name, file]] of Object.entries(
			liquidOptions?.[optionKey] ?? {},
		).entries()) {
			const id = `${optionKey}_${i}`;
			const importPath = toPosixPath(String(file));
			imports += `\nimport ${id} from ${JSON.stringify(`./${importPath}`)};\n`;
			body += `${registerFn}(${JSON.stringify(name)}, ${id});\n`;
		}
	}

	return { imports, body };
}
