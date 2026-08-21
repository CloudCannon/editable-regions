/**
 * Shared harness for the direct tests of the Hugo renderer WASM: boots the
 * real Go WASM in Node (no browser bundle, no Hugo build involved) and exposes
 * the renderer's JS surface. The renderer must be built first
 * (`npm run build:hugo`); the boot throws loudly rather than skipping if the
 * WASM isn't there. State is sequential — later cases build on earlier ones —
 * so ordering matters within a file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

// Side-effect only: defines `globalThis.Go` and the Node fs shim it needs.
import "../../../integrations/hugo/browser/wasm_exec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const RAW_WASM = path.join(RENDERER_DIR, "hugo_renderer.wasm");
const GZ_WASM = path.join(
	RENDERER_DIR,
	"../hugo-module/assets/cc-editable-regions/hugo_renderer.wasm.gz",
);

/** The JS surface the Go renderer exposes on globalThis once running. */
export interface RendererGlobals {
	writeHugoFiles(json: string): { error?: string } | null;
	removeHugoFiles(json: string): { error?: string } | null;
	readHugoFiles(json: string): Record<string, string>;
	initHugoEditorSite(): { error?: string } | null;
	renderHugoPartial(json: string): { html?: string; error?: string } | null;
}

export function renderer(): RendererGlobals {
	return globalThis as unknown as RendererGlobals;
}

// The renderer logs every change event and build to stdout via the wasm_exec
// fs shim; silence that so test output stays readable. Failures are reported
// through the return values, not the console.
let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

/** Restores console.log after a suite that ran bootRenderer. */
export function restoreRendererStdout(): void {
	stdoutSpy?.mockRestore();
	stdoutSpy = undefined;
}

/**
 * Instantiates the WASM renderer and waits for its globals to register.
 * Call in `beforeAll` (with `afterAll(restoreRendererStdout)`).
 */
export async function bootRenderer(): Promise<void> {
	stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});

	if (!fs.existsSync(RAW_WASM) && !fs.existsSync(GZ_WASM)) {
		throw new Error(
			"No hugo_renderer.wasm found. Run `npm run build:hugo` (integrations/hugo/renderer/build.sh) first.",
		);
	}

	const wasmBytes = fs.existsSync(RAW_WASM)
		? fs.readFileSync(RAW_WASM)
		: gunzipSync(fs.readFileSync(GZ_WASM));

	const go = new (globalThis as unknown as { Go: new () => any }).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBytes,
		go.importObject,
	);
	go.run(instance);

	// The Go side registers its globals synchronously at startup.
	while (typeof renderer().renderHugoPartial !== "function") {
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

/** Renders a partial with props and an optional render target (verbatim file
 * path), mirroring the browser runtime's call. */
export function render(
	partial: string,
	props: unknown = {},
	target = "",
): { html?: string; error?: string } {
	return (
		renderer().renderHugoPartial(JSON.stringify({ partial, props, target })) ??
		{}
	);
}
