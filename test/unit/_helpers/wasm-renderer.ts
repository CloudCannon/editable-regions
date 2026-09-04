/**
 * Shared harness for the direct tests of the Hugo renderer WASM: boots the
 * real Go WASM in Node (no browser bundle, no Hugo build involved) and exposes
 * the renderer's JS surface. Requires `npm run build:hugo` and a rebuild after
 * any renderer source change — the boot freshness-checks the artifact and
 * throws rather than silently booting a stale Hugo. State is sequential, so
 * ordering matters within a file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

import { freshnessProblems } from "./freshness";

// Side-effect only: defines `globalThis.Go` and the Node fs shim it needs.
import "../../../integrations/hugo/browser/wasm_exec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const RAW_WASM = path.join(RENDERER_DIR, "hugo_renderer.wasm");
const GZ_WASM = path.join(
	RENDERER_DIR,
	"../hugo-module/assets/_cloudcannon/hugo_renderer.wasm.gz",
);

/** The JS surface the Go renderer exposes on globalThis once running. */
export interface RendererGlobals {
	writeHugoFiles(json: string): { error?: string } | null;
	removeHugoFiles(json: string): { error?: string } | null;
	readHugoFiles(json: string): Record<string, string>;
	initHugoEditorSite(): { error?: string } | null;
	renderHugoPartials(json: string): { html?: string; error?: string } | null;
}

export function renderer(): RendererGlobals {
	return globalThis as unknown as RendererGlobals;
}

// The renderer logs every change event and build to stdout via the wasm_exec
// fs shim; failures are reported through the return values, not the console.
let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

/** Restores console.log after a suite that ran bootRenderer. */
export function restoreRendererStdout(): void {
	stdoutSpy?.mockRestore();
	stdoutSpy = undefined;
}

/**
 * Instantiates the WASM renderer and waits for its globals to register; call
 * in `beforeAll` (with `afterAll(restoreRendererStdout)`). Refuses to boot a
 * stale artifact (renderer sources newer than the wasm) and names the rebuild.
 */
export async function bootRenderer(): Promise<void> {
	stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});

	const artifact = fs.existsSync(RAW_WASM) ? RAW_WASM : GZ_WASM;
	const problems = freshnessProblems([
		{
			label: "the renderer wasm",
			artifact,
			sources: [RENDERER_DIR],
			// The raw build output inside the walked dir is an artifact.
			ignore: ["hugo_renderer.wasm"],
		},
	]);
	if (problems.length > 0) {
		throw new Error(
			[
				"The renderer wasm is stale — tests would boot an out-of-date Hugo:",
				...problems.map((problem) => `  - ${problem}`),
				"Rebuild with `npm run build:hugo` (integrations/hugo/renderer/build.sh) and re-run.",
			].join("\n"),
		);
	}

	const wasmBytes =
		artifact === RAW_WASM
			? fs.readFileSync(RAW_WASM)
			: gunzipSync(fs.readFileSync(GZ_WASM));

	const go = new (globalThis as unknown as { Go: new () => any }).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBytes,
		go.importObject,
	);
	go.run(instance);

	// The Go side registers its globals synchronously at startup.
	while (typeof renderer().renderHugoPartials !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

/**
 * Writes a site snapshot (config files, partials, data files, content stubs)
 * into the renderer's in-memory filesystem and boots the editor site against
 * it.
 */
export function initEditorSite(files: Record<string, string>): void {
	renderer().writeHugoFiles(JSON.stringify(files));
	const initError = renderer().initHugoEditorSite();
	if (initError?.error) {
		throw new Error(`editor site failed to boot: ${initError.error}`);
	}
}

/** Renders a batch of partials with props against one render target (a
 * verbatim file path), mirroring the browser runtime's batched call. */
export function renderBatch(
	requests: Array<{
		id: string;
		partial: string;
		props?: unknown;
	}>,
	target = "",
): { html?: string; error?: string } {
	return (
		renderer().renderHugoPartials(
			JSON.stringify({
				target,
				requests: requests.map((req) => ({
					props: {},
					...req,
				})),
			}),
		) ?? {}
	);
}

/** Renders one partial through the batched surface (array of one). */
export function render(
	partial: string,
	props: unknown = {},
	target = "",
): { html?: string; error?: string } {
	return renderBatch([{ id: "cc-render-0", partial, props }], target);
}
