import "./wasm_exec.js";

export interface HugoWasmBootArgs {
	wasmUrl: string;
	env: string;
	files: Record<string, string>;
}

interface PendingOp {
	run: () => Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (err: unknown) => void;
}

export class HugoWasm {
	private pending: PendingOp[] = [];
	private draining = false;

	async boot(args: HugoWasmBootArgs): Promise<void> {
		await this.enqueue(() => this.runBoot(args));
	}

	writeFiles(json: string): Promise<void> {
		return this.enqueue(async () => {
			writeHugoFiles(json);
		});
	}

	removeFiles(json: string): Promise<void> {
		return this.enqueue(async () => {
			removeHugoFiles(json);
		});
	}

	async init(): Promise<string | undefined> {
		return this.enqueue(async () => initHugoEditorSite()?.error);
	}

	render(payload: string): Promise<{ html?: string; error?: string }> {
		return this.enqueue(
			() =>
				new Promise((resolve) => {
					renderHugoPartials(payload, resolve);
				}),
		);
	}

	private enqueue<T>(run: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.pending.push({
				run,
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			this.pump();
		});
	}

	private pump(): void {
		if (this.draining) return;
		this.draining = true;
		this.drain();
	}

	private async drain(): Promise<void> {
		while (this.pending.length > 0) {
			const op = this.pending.shift();
			if (!op) break;
			try {
				op.resolve(await op.run());
			} catch (err) {
				op.reject(err);
			}
		}
		this.draining = false;
	}

	private async runBoot({
		wasmUrl,
		env,
		files,
	}: HugoWasmBootArgs): Promise<void> {
		const response = await fetch(wasmUrl);
		if (!response.ok || !response.body) {
			throw new Error(
				`Failed to fetch Hugo WASM from ${wasmUrl}: HTTP ${response.status}`,
			);
		}

		let wasmBuffer: ArrayBuffer;
		if (wasmUrl.endsWith(".gz")) {
			const decompressed = response.body.pipeThrough(
				new DecompressionStream("gzip"),
			);
			wasmBuffer = await new Response(decompressed).arrayBuffer();
		} else {
			wasmBuffer = await response.arrayBuffer();
		}

		const go = new (globalThis as any).Go();
		const { instance } = await WebAssembly.instantiate(
			wasmBuffer,
			go.importObject,
		);
		go.run(instance);

		while (
			typeof (globalThis as { renderHugoPartials?: unknown })
				.renderHugoPartials !== "function"
		) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		writeHugoFiles(JSON.stringify({ ...files, "cc-env": env }));
	}
}
