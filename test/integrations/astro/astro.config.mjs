import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [editableRegions(), react()],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es", "fr"],
  },
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({
        context: "client",
        access: "public",
        default: "https://api.example.com",
      }),
      PUBLIC_FEATURE_FLAG: envField.boolean({
        context: "client",
        access: "public",
        default: true,
      }),
      SECRET_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
});
