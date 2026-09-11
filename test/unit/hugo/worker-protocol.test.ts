/**
 * Worker protocol tests: the worker entry's message router against a mocked
 * HugoWasm, and the main-thread HugoRenderer against a fake Worker. The real
 * engine boots elsewhere (no Worker implementation in happy-dom), so these
 * pin the message contract and transport selection only.
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import type {
	WorkerRequest,
	WorkerResponse,
} from "../../../integrations/hugo/browser/worker-protocol.ts";

const mocks = vi.hoisted(() => ({
	boot: vi.fn(),
	writeFiles: vi.fn(),
	removeFiles: vi.fn(),
	init: vi.fn(),
	render: vi.fn(),
	instances: [] as unknown[],
}));

vi.mock("../../../integrations/hugo/browser/hugo-wasm.ts", () => ({
	HugoWasm: class {
		constructor() {
			mocks.instances.push(this);
		}
		boot = mocks.boot;
		writeFiles = mocks.writeFiles;
		removeFiles = mocks.removeFiles;
		init = mocks.init;
		render = mocks.render;
	},
}));

import { HugoRenderer } from "../../../integrations/hugo/browser/hugo-renderer.ts";
import { handleWorkerMessage } from "../../../integrations/hugo/browser/worker.ts";

let posted: WorkerResponse[] = [];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
	mocks.instances = [];
	posted = [];
});

function capturePostMessage(): void {
	vi.stubGlobal(
		"postMessage",
		vi.fn((response: WorkerResponse) => {
			posted.push(response);
		}),
	);
}

async function handle(request: WorkerRequest): Promise<void> {
	const event = { data: request } as unknown as MessageEvent<WorkerRequest>;
	await handleWorkerMessage(event);
}

describe("worker message router", () => {
	test("boot creates the engine and acknowledges", async () => {
		capturePostMessage();
		await handle({
			id: "m0",
			kind: "boot",
			wasmUrl: "test.wasm",
			env: "production",
			files: {},
		});
		expect(mocks.boot).toHaveBeenCalledWith(
			expect.objectContaining({
				wasmUrl: "test.wasm",
				env: "production",
				files: {},
			}),
		);
		expect(posted).toEqual([{ id: "m0" }]);
	});

	test("init forwards the engine error in the reply", async () => {
		capturePostMessage();
		mocks.init.mockResolvedValue("config broken");
		await handle({ id: "m1", kind: "init" });
		expect(posted).toEqual([{ id: "m1", error: "config broken" }]);
	});

	test("render forwards the html result keyed by message id", async () => {
		capturePostMessage();
		mocks.render.mockResolvedValue({ html: "<b>x</b>" });
		await handle({ id: "m2", kind: "render", payload: "{}" });
		expect(posted).toEqual([{ id: "m2", html: "<b>x</b>", error: undefined }]);
	});

	test("a thrown engine error becomes an error reply, not a worker crash", async () => {
		capturePostMessage();
		mocks.render.mockRejectedValue(new Error("wedge"));
		await handle({ id: "m3", kind: "render", payload: "{}" });
		expect(posted).toEqual([{ id: "m3", error: "Error: wedge" }]);
	});
});

class FakeWorker {
	static instances: FakeWorker[] = [];
	onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
	posted: WorkerRequest[] = [];

	constructor() {
		FakeWorker.instances.push(this);
	}

	postMessage(message: WorkerRequest): void {
		this.posted.push(message);
	}

	emit(response: WorkerResponse): void {
		this.onmessage?.({ data: response });
	}
}

async function bootRendererOverFakeWorker(): Promise<{
	renderer: HugoRenderer;
	worker: FakeWorker;
}> {
	vi.stubGlobal("Worker", FakeWorker);
	FakeWorker.instances = [];
	const renderer = new HugoRenderer({
		wasmUrl: "test.wasm",
		env: "production",
		workerUrl: "worker.js",
		getTarget: () => "content/notes/one.md",
		getFiles: () => ({}),
		onBooted: () => Promise.resolve(),
	});
	const ready = renderer.ready();
	await vi.waitFor(() =>
		expect(FakeWorker.instances[0]?.posted).toHaveLength(1),
	);
	const worker = FakeWorker.instances[0];
	expect(worker.posted[0].kind).toBe("boot");

	worker.emit({ id: "cc-worker-0" });
	await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
	expect(worker.posted[1].kind).toBe("init");

	worker.emit({ id: "cc-worker-1" });
	await ready;
	return { renderer, worker };
}

describe("HugoRenderer over a worker", () => {
	test("boot and init sequence drives the worker messages in order", async () => {
		await bootRendererOverFakeWorker();
	});

	test("a boot error rejects ready with the engine's message", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		FakeWorker.instances = [];
		const renderer = new HugoRenderer({
			wasmUrl: "test.wasm",
			env: "production",
			workerUrl: "worker.js",
			getTarget: () => "",
			getFiles: () => ({}),
			onBooted: () => Promise.resolve(),
		});
		const ready = renderer.ready();
		await vi.waitFor(() =>
			expect(FakeWorker.instances[0]?.posted).toHaveLength(1),
		);
		FakeWorker.instances[0].emit({ id: "cc-worker-0", error: "no wasm here" });
		await expect(ready).rejects.toThrow("no wasm here");
	});

	test("renders within the batch window coalesce into one worker message", async () => {
		const { renderer, worker } = await bootRendererOverFakeWorker();

		const first = renderer.renderPartial("a.html", { n: 1 });
		const second = renderer.renderPartial("b.html");
		await vi.waitFor(() => expect(worker.posted).toHaveLength(3));

		const render = worker.posted[2];
		expect(render.kind).toBe("render");
		const payload = JSON.parse((render as { payload: string }).payload);
		expect(payload.target).toBe("content/notes/one.md");
		expect(payload.requests).toHaveLength(2);

		worker.emit({
			id: "cc-worker-2",
			html: '<div data-cc-render="cc-render-0">A</div><div data-cc-render="cc-render-1">B</div>',
		});
		const [elA, elB] = await Promise.all([first, second]);
		expect(elA.textContent).toBe("A");
		expect(elB.textContent).toBe("B");
		expect(elA.hasAttribute("data-cc-render")).toBe(false);
	});

	test("a render error message rejects the batched calls", async () => {
		const { renderer, worker } = await bootRendererOverFakeWorker();

		const first = renderer.renderPartial("a.html");
		const second = renderer.renderPartial("b.html");
		await vi.waitFor(() => expect(worker.posted).toHaveLength(3));

		worker.emit({ id: "cc-worker-2", error: "boom" });
		await expect(first).rejects.toThrow("boom");
		await expect(second).rejects.toThrow("boom");
	});
});

describe("HugoRenderer fallback", () => {
	test("a throwing Worker constructor falls back to the in-page engine", async () => {
		vi.stubGlobal(
			"Worker",
			class {
				constructor() {
					throw new Error("worker blocked");
				}
			},
		);
		const renderer = new HugoRenderer({
			wasmUrl: "test.wasm",
			env: "production",
			workerUrl: "worker.js",
			getTarget: () => "",
			getFiles: () => ({ "config.json": "{}" }),
			onBooted: () => Promise.resolve(),
		});
		await renderer.ready();
		expect(mocks.instances).toHaveLength(1);
		expect(mocks.boot).toHaveBeenCalledWith(
			expect.objectContaining({
				wasmUrl: "test.wasm",
				env: "production",
				files: { "config.json": "{}" },
			}),
		);
	});
});
