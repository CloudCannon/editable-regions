/** Boots the real Go WASM renderer; state is sequential and a stale artifact is refused. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

import { freshnessProblems } from "./freshness.js";

// Side-effect only: defines `globalThis.Go` and the Node fs shim it needs.
import "../../../integrations/hugo/browser/wasm_exec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.resolve(here, "../../../integrations/hugo/renderer");
const RAW_WASM = path.join(RENDERER_DIR, "hugo_renderer.wasm");
const GZ_WASM = path.join(
	RENDERER_DIR,
	"../hugo-module/assets/_cloudcannon/hugo_renderer.wasm.gz",
);

export interface RendererGlobals {
	writeHugoFiles(json: string): { error?: string } | null;
	removeHugoFiles(json: string): { error?: string } | null;
	readHugoFiles(json: string): Record<string, string>;
	initHugoEditorSite(): { error?: string } | null;
	renderHugoPartials(
		json: string,
		callback: (result: { html?: string; error?: string }) => void,
	): void;
}

export function renderer(): RendererGlobals {
	return globalThis as unknown as RendererGlobals;
}

let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

export function restoreRendererStdout(): void {
	stdoutSpy?.mockRestore();
	stdoutSpy = undefined;
}

/** Refuses a stale artifact; pair `beforeAll` with `afterAll(restoreRendererStdout)`. */
export async function bootRenderer(): Promise<void> {
	stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});

	const artifact = fs.existsSync(RAW_WASM) ? RAW_WASM : GZ_WASM;
	const problems = freshnessProblems([
		{
			label: "the renderer wasm",
			artifact,
			sources: [RENDERER_DIR],
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

	while (typeof renderer().renderHugoPartials !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

export function initEditorSite(files: Record<string, string>): void {
	renderer().writeHugoFiles(JSON.stringify(files));
	const initError = renderer().initHugoEditorSite();
	if (initError?.error) {
		throw new Error(`editor site failed to boot: ${initError.error}`);
	}
}

export function renderBatch(
	requests: Array<{
		id: string;
		partial: string;
		props?: unknown;
	}>,
	target = "",
): Promise<{ html?: string; error?: string }> {
	return new Promise((resolve) => {
		renderer().renderHugoPartials(
			JSON.stringify({
				target,
				requests: requests.map((req) => ({
					props: {},
					...req,
				})),
			}),
			resolve,
		);
	});
}

export function render(
	partial: string,
	props: unknown = {},
	target = "",
): Promise<{ html?: string; error?: string }> {
	return renderBatch([{ id: "cc-render-0", partial, props }], target);
}
