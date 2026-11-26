/**
 * The suites import these bundles for their side effects only. They're built by
 * `npm run test:build-fixtures` and are not checked in, so typechecking a fresh
 * checkout (CI runs it before the fixture builds) has no file to resolve.
 */
declare module "*_fixtures/astro/dist/_astro/live-editing.js";
declare module "*_fixtures/astro2/dist/_astro/live-editing.js";
declare module "*_fixtures/astro7/dist/_astro/live-editing.js";
declare module "*_fixtures/astro-svelte4/dist/_astro/live-editing.js";
declare module "*_fixtures/svelte3/dist/live-editing.js";
declare module "*_fixtures/svelte4/dist/live-editing.js";
declare module "*_fixtures/vue2/dist/live-editing.js";
declare module "*register-components.js";
