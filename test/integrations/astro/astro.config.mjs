import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [editableRegions(), react()],
});
