import { enhanceHugoError, missingComponentError } from "./errors.ts";
import { HugoWasm } from "./hugo-wasm.ts";
import { group, groupEnd, log, warn } from "./logger.ts";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.ts";

export interface EngineTransport {
	boot(args: {
		wasmUrl: string;
		env: string;
		files: Record<string, string>;
	}): Promise<void>;
	writeFiles(json: string): Promise<void>;
	removeFiles(json: string): Promise<void>;
	init(): Promise<string | undefined>;
	render(payload: string): Promise<{ html?: string; error?: string }>;
}

class WorkerClient implements EngineTransport {
	private pending = new Map<string, (response: WorkerResponse) => void>();
	private nextId = 0;

	constructor(private worker: Worker) {
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const response = event.data;
			this.pending.get(response.id)?.(response);
			this.pending.delete(response.id);
		};
	}

	private send(request: WorkerRequest): Promise<WorkerResponse> {
		return new Promise((resolve) => {
			this.pending.set(request.id, resolve);
			this.worker.postMessage(request);
		});
	}

	async boot({
		wasmUrl,
		env,
		files,
	}: {
		wasmUrl: string;
		env: string;
		files: Record<string, string>;
	}): Promise<void> {
		const response = await this.send({
			id: `cc-worker-${this.nextId++}`,
			kind: "boot",
			wasmUrl,
			env,
			files,
		});
		if (response.error) {
			throw new Error(response.error);
		}
	}

	async writeFiles(json: string): Promise<void> {
		await this.send({
			id: `cc-worker-${this.nextId++}`,
			kind: "writeFiles",
			json,
		});
	}

	async removeFiles(json: string): Promise<void> {
		await this.send({
			id: `cc-worker-${this.nextId++}`,
			kind: "removeFiles",
			json,
		});
	}

	async init(): Promise<string | undefined> {
		const response = await this.send({
			id: `cc-worker-${this.nextId++}`,
			kind: "init",
		});
		return response.error;
	}

	async render(payload: string): Promise<{ html?: string; error?: string }> {
		const response = await this.send({
			id: `cc-worker-${this.nextId++}`,
			kind: "render",
			payload,
		});
		return { html: response.html, error: response.error };
	}
}

interface QueuedRender {
	id: string;
	partial: string;
	props: Record<string, any>;
	resolve: (el: HTMLElement) => void;
	reject: (err: unknown) => void;
}

const BATCH_WINDOW_MS = 10;

export interface HugoRendererOptions {
	wasmUrl: string;
	env: string;
	workerUrl?: string;
	getTarget: () => string;
	getFiles: () => Record<string, string>;
	onBooted?: () => Promise<void>;
}

/**
 * Main-thread facade over the Hugo engine: owns batching, the render-id demux
 * into real elements, and transport selection. Runs the engine in a worker
 * when one is provided and constructible, falling back to an in-page
 * HugoWasm; the interface returns HTMLElements either way.
 */
export class HugoRenderer {
	private enginePromise: Promise<void> | null = null;
	private transportPromise: Promise<EngineTransport> | null = null;
	private batch: QueuedRender[] = [];
	private batchTimer: ReturnType<typeof setTimeout> | null = null;
	private nextRenderId = 0;

	constructor(private options: HugoRendererOptions) {}

	async ready(): Promise<void> {
		this.enginePromise ??= this.start().catch((err) => {
			this.enginePromise = null;
			this.transportPromise = null;
			throw err;
		});
		await this.enginePromise;
	}

	async writeFiles(json: string): Promise<void> {
		await (await this.transport()).writeFiles(json);
	}

	async removeFiles(json: string): Promise<void> {
		await (await this.transport()).removeFiles(json);
	}

	async renderPartial(
		partial: string,
		props: Record<string, any> = {},
	): Promise<HTMLElement> {
		await this.ready();
		return new Promise<HTMLElement>((resolve, reject) => {
			const id = `cc-render-${this.nextRenderId++}`;
			log("Queueing Hugo component:", partial, "Props:", props);
			this.batch.push({ id, partial, props, resolve, reject });
			if (this.batchTimer === null) {
				this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_WINDOW_MS);
			}
		});
	}

	private transport(): Promise<EngineTransport> {
		this.transportPromise ??= Promise.resolve(this.createEngine());
		return this.transportPromise;
	}

	private createEngine(): EngineTransport {
		if (this.options.workerUrl && typeof Worker === "function") {
			try {
				log("Starting Hugo renderer in a worker");
				return new WorkerClient(new Worker(this.options.workerUrl));
			} catch {
				warn("Hugo worker unavailable, rendering on the main thread");
			}
		}
		return new HugoWasm();
	}

	private async start(): Promise<void> {
		const engine = await this.transport();

		group("Starting Hugo renderer");
		await engine.boot({
			wasmUrl: this.options.wasmUrl,
			env: this.options.env,
			files: this.options.getFiles(),
		});
		await this.options.onBooted?.();

		const initError = await engine.init();
		if (initError) {
			groupEnd();
			throw new Error(`Hugo editor site failed to build: ${initError}`);
		}

		log("Hugo renderer ready");
		groupEnd();
	}

	private flushBatch(): void {
		this.batchTimer = null;
		const queued = this.batch;
		this.batch = [];
		if (queued.length === 0) return;

		group(`Rendering ${queued.length} Hugo component(s)`);
		this.runBatch(queued);
	}

	private async runBatch(queued: QueuedRender[]): Promise<void> {
		try {
			const engine = await this.ready().then(() => this.transport());
			const result = await engine.render(
				JSON.stringify({
					target: this.options.getTarget(),
					requests: queued.map(({ id, partial, props }) => ({
						id,
						partial,
						props,
					})),
				}),
			);
			this.demuxBatch(queued, result);
		} catch (err) {
			for (const { partial, reject } of queued) {
				reject(enhanceHugoError(String(err), partial));
			}
		} finally {
			groupEnd();
		}
	}

	private demuxBatch(
		queued: QueuedRender[],
		result: { html?: string; error?: string } | null,
	): void {
		if (result?.error || typeof result?.html !== "string") {
			log("Render error:", result?.error);
			for (const { partial, reject } of queued) {
				reject(enhanceHugoError(result?.error ?? "no output", partial));
			}
			return;
		}

		const holder = document.createElement("div");
		holder.innerHTML = result.html;
		for (const render of queued) {
			const keyed = holder.querySelector<HTMLElement>(
				`[data-cc-render="${render.id}"]`,
			);
			if (!keyed) {
				render.reject(
					new Error(
						`Hugo render produced no output for component "${render.partial}"`,
					),
				);
				continue;
			}

			const missing = keyed.querySelector("cc-missing-partial");
			if (missing) {
				render.reject(
					missingComponentError(
						missing.getAttribute("data-name") || render.partial,
					),
				);
				continue;
			}

			const failed = keyed.querySelector("cc-failed-partial");
			if (failed) {
				render.reject(
					enhanceHugoError(
						failed.getAttribute("data-message") || "unknown error",
						failed.getAttribute("data-name") || render.partial,
					),
				);
				continue;
			}

			keyed.removeAttribute("data-cc-render");
			log("Rendered HTML preview:", keyed.innerHTML.substring(0, 200));
			render.resolve(keyed);
		}
	}
}
