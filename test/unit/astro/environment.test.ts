import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

// Built bundle — run `npm run test:build-astro-fixture` first.
import "../_fixtures/astro/dist/_astro/live-editing.js";

// Read the built bundle once for text-scan tests.
const bundlePath = resolve(
	import.meta.dirname,
	"../_fixtures/astro/dist/_astro/live-editing.js",
);
const bundleSource = readFileSync(bundlePath, "utf8");

test("a component can access PUBLIC_ env vars defined in the env schema", async () => {
	const el = await window.cc_components?.["astro-env"]({});

	expect(el?.querySelector(".site-name")?.textContent).toBe(
		"PUBLIC_SITE_NAME: Fixture Site",
	);
	expect(el?.querySelector(".max-items")?.textContent).toBe(
		"PUBLIC_MAX_ITEMS: 10",
	);
});

test("getSecret is shimmed and renders undefined instead of leaking the secret value", async () => {
	const el = await window.cc_components?.["astro-env"]({});

	// getSecret is shimmed to return undefined — must not leak the actual value.
	expect(el?.querySelector(".secret-value")?.textContent).toBe(
		"secretValue: undefined",
	);
});

test("the rendered env component matches the snapshot", async () => {
	const el = await window.cc_components?.["astro-env"]({});

	expect(el?.outerHTML).toMatchSnapshot();
});

test("PUBLIC_ env var values are present in the live-editing bundle", () => {
	// Public env vars are inlined at build time for client-side access.
	expect(bundleSource).toContain('"Fixture Site"');
	expect(bundleSource).toContain("10");
});

test("secret env var names and values are not leaked in the live-editing bundle", () => {
	// The secret var name and value must never appear in the client bundle.
	expect(bundleSource).not.toContain("SECRET_API_KEY");
	// Guard against the value leaking if a real secret is set at build time.
	expect(bundleSource).not.toContain("testSecret");
});
