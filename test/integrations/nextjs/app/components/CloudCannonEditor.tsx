"use client";

import { useEffect } from "react";

/**
 * Renders nothing — exists purely to trigger the editor-only dynamic import
 * once per page load (Next.js has no plugin mechanism).
 */
export default function CloudCannonEditor() {
	useEffect(() => {
		// CloudCannon sets this inside the Visual Editor iframe. Keeping the import
		// dynamic and gated means the registration code — and every component it
		// pulls in — stays out of the production bundle entirely.
		if (!(window as { inEditorMode?: boolean }).inEditorMode) {
			return;
		}

		// Relative path on purpose: "@cloudcannon/..." looks like an npm scope and
		// would resolve to the package rather than to this project's file.
		import("../cloudcannon/registerComponents").catch((error) => {
			console.warn("Failed to load CloudCannon component registration:", error);
		});
	}, []);

	return null;
}
