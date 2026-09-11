export type WorkerRequest =
	| {
			id: string;
			kind: "boot";
			wasmUrl: string;
			env: string;
			files: Record<string, string>;
	  }
	| { id: string; kind: "writeFiles"; json: string }
	| { id: string; kind: "removeFiles"; json: string }
	| { id: string; kind: "init" }
	| { id: string; kind: "render"; payload: string };

export interface WorkerResponse {
	id: string;
	html?: string;
	error?: string;
}
