import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vi } from "vitest";

import { freshnessProblems } from "./freshness.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultFixture = "hugo";

const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const WASM_ASSET = path.resolve(
	here,
	"../../../integrations/hugo/hugo-module/assets/_cloudcannon/hugo_renderer.wasm.gz",
);

let currentFixture = defaultFixture;

/** Selects the fixture bundle a suite boots; call before `beforeAll(loadHugoBundle)`. */
export function useHugoFixture(fixture: string): void {
	currentFixture = fixture;
}

function bundleBuildScript(fixture: string): string {
	// The default fixture's script predates per-fixture naming.
	return fixture === "hugo"
		? "test:build-hugo-fixture"
		: `test:build-hugo-${fixture}`;
}

function fixtureAssetDir(): string {
	return path.resolve(
		here,
		`../_fixtures/${currentFixture}/public/_cloudcannon`,
	);
}

function findAsset(name: string, pattern: RegExp): string {
	const dir = fixtureAssetDir();
	const file = fs.readdirSync(dir).find((f) => pattern.test(f));
	if (!file) {
		throw new Error(
			`No ${name} in ${dir} — run \`npm run test:build-hugo-fixture\` (hugo-custom-dirs via test:build-hugo-custom-dirs) first.`,
		);
	}
	return path.join(dir, file);
}

let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

export function restoreRendererStdout(): void {
	stdoutSpy?.mockRestore();
	stdoutSpy = undefined;
}

/** Boots the fixture's bundle with fetch stubbed; refuses a stale or ambiguous bundle. */
export async function loadHugoBundle(): Promise<void> {
	assertFreshBundle(currentFixture);
	installWasmFetchStub();
	stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	await import(
		pathToFileURL(findAsset("live-editing bundle", /^live-editing\..+\.js$/))
			.href
	);
	await vi.waitFor(() => {
		if (!window.cc_components) {
			throw new Error("cc_components has not been published");
		}
	});
}

function assertFreshBundle(fixture: string): void {
	const assetDir = fixtureAssetDir();
	const rebuild = `\`npm run ${bundleBuildScript(fixture)}\` (or \`npm run test:build-fixtures\` for every fixture)`;

	if (!fs.existsSync(assetDir)) {
		throw new Error(
			`The ${fixture} fixture bundle isn't built. Run \`${rebuild}\` first.`,
		);
	}

	const jsFiles = fs
		.readdirSync(assetDir)
		.filter((f) => /^live-editing\..+\.js$/.test(f));
	const wasmFiles = fs
		.readdirSync(assetDir)
		.filter((f) => /^hugo_renderer\.wasm\..+\.gz$/.test(f));
	if (jsFiles.length !== 1 || wasmFiles.length !== 1) {
		throw new Error(
			`The ${fixture} fixture bundle holds ${jsFiles.length} live-editing js and ${wasmFiles.length} wasm copies — stale fingerprints. Run \`${rebuild}\`, which clears public/ first, then re-run.`,
		);
	}

	const problems = freshnessProblems([
		{
			label: "the renderer wasm asset",
			artifact: WASM_ASSET,
			sources: ["main.go", "go.mod", "go.sum"].map((f) =>
				path.join(RENDERER_DIR, f),
			),
		},
		{
			label: `the ${fixture} fixture bundle (${jsFiles[0]})`,
			artifact: path.join(assetDir, jsFiles[0]),
			sources: [
				path.resolve(here, "../../../integrations/hugo/browser"),
				path.resolve(here, "../../../integrations/hugo/hugo-module"),
				path.resolve(here, "../../../helpers"),
				path.resolve(here, `../_fixtures/${fixture}`),
			],
		},
		{
			label: `the ${fixture} fixture's wasm copy (${wasmFiles[0]})`,
			artifact: path.join(assetDir, wasmFiles[0]),
			copiedFrom: WASM_ASSET,
		},
	]);

	if (problems.length > 0) {
		throw new Error(
			[
				`The ${fixture} fixture bundle is stale — tests would load out-of-date artifacts:`,
				...problems.map((problem) => `  - ${problem}`),
				`Rebuild with \`npm run build:hugo\` (when the wasm is listed) and ${rebuild}, then re-run.`,
			].join("\n"),
		);
	}
}

function installWasmFetchStub(): void {
	const bytes = fs.readFileSync(
		findAsset("renderer WASM", /^hugo_renderer\.wasm\..+\.gz$/),
	);
	globalThis.fetch = async (input: RequestInfo | URL) => {
		if (String(input).includes("hugo_renderer.wasm")) {
			return new Response(new Uint8Array(bytes));
		}
		return new Response(null, { status: 404 });
	};
}
