import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vi } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetDir = path.resolve(
	here,
	"../_fixtures/hugo/public/cc-editable-regions",
);

function findAsset(name: string, pattern: RegExp): string {
	const file = fs.readdirSync(assetDir).find((f) => pattern.test(f));
	if (!file) {
		throw new Error(
			`No ${name} in ${assetDir} — run \`npm run test:build-hugo-fixture\` first.`,
		);
	}
	return path.join(assetDir, file);
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
 * Hugo renderer against it, exactly as the browser runtime would: `fetch` is
 * stubbed to serve the fingerprinted WASM from the fixture's build output,
 * and the engine starts once the CloudCannon API mock is on `window`.
 *
 * Call in `beforeAll` (with `afterAll(restoreRendererStdout)`); the first
 * render then awaits engine boot transparently.
 */
export async function loadHugoBundle(): Promise<void> {
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
