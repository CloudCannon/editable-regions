import editableRegions from "@cloudcannon/editable-regions/astro-integration";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [editableRegions(), react(), svelte()],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es", "fr"],
  },
  vite: {
    build: {
      minify: false,
      sourcemap: 'inline'
    }
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
