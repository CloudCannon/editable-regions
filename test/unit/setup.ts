/** Installs the API mock on `window` before `helpers/cloudcannon.ts` reads it at module load. */
import { createMockApi } from "./_mocks/cloudcannon.js";

if (typeof window !== "undefined") {
	(window as any).CloudCannonAPI = {
		useVersion: () => createMockApi(),
	};
}
