/**
 * Smoke-check the built register-components.js bundle against the expectations
 * documented in this fixture's README. Run after `npm run build`.
 *
 * The bundle imports the user's real Eleventy config and replays it in the
 * browser (`collectAndRegisterEleventyHelpers`), so the config's *source* —
 * closures and all — is bundled in rather than the helpers being serialised
 * one-by-one.
 *
 * Scope: this is a STRUCTURAL smoke test of the plugin's *emit contract* — one
 * assertion per distinct thing the plugin outputs (collector call, skip-object
 * shape, stub injection, the static globals, override/component register
 * calls, the file-walk). It deliberately does NOT assert individual mirrored
 * helper names/bodies (`shout`, `year`, `echo`, …): those are runtime behavior,
 * validated by opening the fixture in CloudCannon's Visual Editor and watching
 * the demo components re-render. Don't re-add per-helper greps here — a body
 * being present in the bundle never proved it *works*, only that esbuild kept
 * it. Runtime coverage lives in the editor; this file guards the build output.
 *
 * Each assertion is a substring or regex match against the bundle text.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, "_site", "register-components.js");

if (!fs.existsSync(bundlePath)) {
  console.error(`Bundle not found at ${bundlePath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const bundle = fs.readFileSync(bundlePath, "utf8");

/** @type {Array<{name: string, match: string | RegExp}>} */
const expectations = [
  // Engine + builtins wiring
  { name: "createSharedLiquidEngine call", match: "createSharedLiquidEngine(" },
  { name: "registerEleventyBuiltins call", match: "registerEleventyBuiltins(" },

  // Config-replay auto-mirror: the collector is invoked with the real config.
  { name: "collector invoked with the config", match: /collectAndRegisterEleventyHelpers\(\s*\w+/ },

  // The real config was bundled, not serialised: `buildInfo` is a module-scope
  // const the helpers close over. It's in the bundle only because the config
  // module itself was bundled — `fn.toString()` serialisation would drop it.
  // This is the load-bearing proof of the whole approach.
  { name: "config bundled with closures intact", match: "buildInfo" },

  // Browser-stub plugin: the config imports `node:fs` and `@11ty/eleventy` at
  // top level, so both must resolve to the call-throwing stub for the config
  // to bundle for the browser at all.
  { name: "node/build-time imports stubbed", match: "Node/build-time API was called" },

  // Skip handling. Builtin ports are skipped inside the collector (single
  // source of truth, derived from the implementations); the emitted call only
  // passes override names on top.
  // (1) the collector seeds the builtin-port skip from the derived list,
  { name: "collector seeds builtin skip", match: /new Set\(\[\s*\.\.\.builtinFilterNames/ },
  // (2) that list is derived from the implementations, not hand-maintained,
  { name: "builtin names derived from implementations", match: /builtinFilterNames = \[[\s\S]*?Object\.keys\([\s\S]*?"renderContent"/ },
  // (3) override names ARE passed in the emitted skip so the override wins,
  { name: "skip — override names passed", match: /"skip":\s*\{[\s\S]*?"filters":\s*\[[^\]]*"readmeSize"/ },
  // (4) auto-mirrored names are NOT skipped (else they'd be dropped),
  { name: "skip — mirrored names not skipped", match: /"skip":\s*\{(?:(?!"stamp")[\s\S])*?\}\s*\}\s*\)/ },
  // (5) all four kind-keys present, so skipping can't silently break for a kind.
  { name: "skip — object has all four kinds", match: /"skip":\s*\{\s*"filters":\s*\[[\s\S]*?"shortcodes":\s*\[[\s\S]*?"pairedShortcodes":\s*\[[\s\S]*?"tags":\s*\[/ },

  // Import-registrations (the consolidated emit path) — an override and a
  // pinned component exercise two distinct register fns from one loop.
  { name: "override register call emitted", match: 'registerFilter("readmeSize"' },
  { name: "component register call emitted", match: 'registerLiquidComponent("card"' },

  // Env: allowlist + prefix are two distinct features.
  { name: "env allowlist emitted", match: /registerProcessEnv\(\{[^)]*"NODE_ENV"/ },
  { name: "env prefix emitted", match: /registerProcessEnv\(\{[^)]*"PUBLIC_/ },

  // Static eleventy global — shape + the deliberate runMode hardcode.
  { name: "eleventyData has version + directories", match: /registerEleventyData\(\{[\s\S]*?"version"[\s\S]*?"directories"/ },
  { name: "eleventy.env.runMode is 'serve'", match: /"runMode"\s*:\s*"serve"/ },

  // Build-time page map (default-on) — populated with resolved URLs.
  { name: "pageMap populated with a url", match: /registerPageMap\(\{[\s\S]*?"url"\s*:\s*"\// },

  // pkg global — package.json mirrored verbatim (including dependencies).
  { name: "pkg has name field", match: /registerPkg\(\{[^)]*"name"/ },
  { name: "pkg mirrors dependencies verbatim", match: /registerPkg\(\{[\s\S]*?"dependencies"/ },

  // File walk — a `.liquid` template inlined into the in-memory filesystem.
  { name: "liquid template inlined into cc_liquid_files", match: /window\.cc_liquid_files\["[^"]*\.liquid"\]/ },
];

let failures = 0;
for (const { name, match } of expectations) {
  const ok = typeof match === "string" ? bundle.includes(match) : match.test(bundle);
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} (expected match: ${match})`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} bundle expectation(s) not met.`);
  process.exit(1);
}
console.log(`\nAll ${expectations.length} bundle expectations met.`);
