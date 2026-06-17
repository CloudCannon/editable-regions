/**
 * Browser entry for the 11ty ports (`@cloudcannon/editable-regions/eleventy/browser`).
 * The generated bundle imports both helpers from here. Kept as a thin barrel
 * so `collect-config.mjs` can import the builtin name lists from
 * `liquid-builtins.mjs` without the two forming an import cycle.
 */

export { collectAndRegisterEleventyHelpers } from "./collect-config.mjs";
export { registerEleventyBuiltins } from "./liquid-builtins.mjs";
