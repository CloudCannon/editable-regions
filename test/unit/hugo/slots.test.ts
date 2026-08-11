import { afterAll, beforeAll, expect, test } from "vitest";

import { loadHugoBundle, restoreRendererStdout } from "../_helpers/hugo-bundle";

// Built fixture bundle — run `npm run test:build-hugo-fixture` first.
beforeAll(loadHugoBundle);
afterAll(restoreRendererStdout);

test("a parent partial passes a props object into a child partial", async () => {
	// `slot-parent` calls {{ partial "slot-shell.html" .slotProps }}.
	const el = await window.cc_components?.["slot-parent"]({
		slotProps: { content: "slotted from parent" },
	});

	const shell = el?.querySelector(".slot-shell");
	expect(shell).toBeTruthy();
	expect(shell?.textContent?.trim()).toBe("slotted from parent");
	expect(el?.outerHTML).toMatchSnapshot();
});

test("a component renders gracefully when no slot props are given", async () => {
	// With no slotProps the `with` guard skips the shell entirely.
	const el = await window.cc_components?.["slot-parent"]({});

	expect(el?.querySelector(".slot-shell")).toBeNull();
	expect(el?.outerHTML).toMatchSnapshot();
});

test("nested partial composition resolves (parent → child → grandchild)", async () => {
	const el = await window.cc_components?.["slot-child"]({
		childProps: { message: "hello from grandchild" },
	});

	const grandchild = el?.querySelector(".slot-grandchild");
	expect(grandchild).toBeTruthy();
	expect(grandchild?.textContent?.trim()).toBe("hello from grandchild");
});

test("an unknown component key rejects with an enhanced error", async () => {
	await expect(window.cc_components?.["missing-include"]({})).rejects.toThrow(
		/No Hugo partial found for component "missing-include"/,
	);
	// The enhanced error names the bundled partials; the list is sorted, so
	// match the members rather than their exact ordering.
	await expect(window.cc_components?.["missing-include"]({})).rejects.toThrow(
		/Bundled partials include: card\.html, .*nested\/deep\.html/i,
	);
	await expect(window.cc_components?.["missing-include"]({})).rejects.toThrow(
		/globals-title\.html/,
	);
});
