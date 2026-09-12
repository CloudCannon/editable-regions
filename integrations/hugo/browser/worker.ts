import { HugoWasm } from "./hugo-wasm.ts";
import type { WorkerRequest } from "./worker-protocol.ts";

let engine: HugoWasm | null = null;

export async function handleWorkerMessage(
	event: MessageEvent<WorkerRequest>,
): Promise<void> {
	const request = event.data;
	try {
		switch (request.kind) {
			case "boot": {
				engine = new HugoWasm();
				await engine.boot(request);
				break;
			}
			case "writeFiles": {
				await engine?.writeFiles(request.json);
				break;
			}
			case "removeFiles": {
				await engine?.removeFiles(request.json);
				break;
			}
			case "init": {
				const error = await engine?.init();
				if (error) {
					postMessage({ id: request.id, error });
					return;
				}
				break;
			}
			case "render": {
				const result = await engine?.render(request.payload);
				postMessage({
					id: request.id,
					html: result?.html,
					error: result?.error,
				});
				return;
			}
		}
		postMessage({ id: request.id });
	} catch (err) {
		postMessage({ id: request.id, error: String(err) });
	}
}

self.onmessage = (event) => {
	handleWorkerMessage(event);
};
