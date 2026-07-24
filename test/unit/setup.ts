/**
 * Installs the CloudCannon Visual Editor API mock on `window` so that
 * `helpers/cloudcannon.mjs` takes its synchronous `window.CloudCannonAPI`
 * path at module load. Test files inject data via `./_mocks/cloudcannon`.
 */
import { createMockApi } from "./_mocks/cloudcannon";

(window as any).CloudCannonAPI = {
	useVersion: () => createMockApi(),
};
