import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vi } from "vitest";

import { freshnessProblems } from "./freshness";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultFixture = "hugo";

const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const WASM_ASSET = path.resolve(
	here,
	"../../../integrations/hugo/hugo-module/assets/_cloudcannon/hugo_renderer.wasm.gz",
);

/** The fixture loadHugoBundle boots; select with useHugoFixture(). */
let currentFixture = defaultFixture;

/**
 * Selects which built `test/unit/_fixtures/<name>` bundle a suite boots; call
 * before `beforeAll(loadHugoBundle)`. The default ("hugo") uses the default
 * directory layout; "hugo-custom-dirs" relocates its template/file dirs.
 */
export function useHugoFixture(fixture: string): void {
	currentFixture = fixture;
}

/** The npm script that rebuilds a fixture's bundle. */
function bundleBuildScript(fixture: string): string {
	// The default fixture's script predates per-fixture naming.
	return fixture === "hugo"
		? "test:build-hugo-fixture"
		: `test:build-hugo-${fixture}`;
}

/** Resolves the built asset dir for the selected fixture. */
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

/** The Go renderer logs change events and build progress through console.log. */
let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

/** Restores console.log after a suite that ran loadHugoBundle. */
export function restoreRendererStdout(): void {
	stdoutSpy?.mockRestore();
	stdoutSpy = undefined;
}

/**
 * Loads the fixture's fingerprinted live-editing bundle and boots the real
 * Hugo renderer against it, exactly as the browser runtime would (`fetch` is
 * stubbed to serve the fingerprinted WASM from the fixture's build output).
 * The bundle is a local, untracked build artifact — a source change without
 * the matching rebuild means out-of-date artifacts, so the boot refuses
 * anything stale and names the rebuild. Call in `beforeAll` (with
 * `afterAll(restoreRendererStdout)`); select the fixture with useHugoFixture()
 * first for sites that don't use default directory layout.
 */
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

/**
 * Throws when the selected fixture's bundle is missing, stale, or inconsistent
 * with its sources, naming the rebuild.
 */
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
			// Exact files: the renderer dir also holds raw build output that
			// build.sh regenerates before the gz.
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

/** Serves the emitted, fingerprinted renderer WASM for the runtime's fetch. */
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
