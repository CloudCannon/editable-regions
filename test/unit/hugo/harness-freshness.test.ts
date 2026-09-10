/**
 * Unit tests for the artifact freshness checker the Hugo harnesses use: the
 * fixture bundles and renderer wasm are local, untracked builds, and a source
 * change without the matching rebuild makes suites pass or fail against stale
 * artifacts. Detection is pinned with synthetic artifacts and controlled
 * mtimes (no real fixture state involved).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, expect, test } from "vitest";

import { freshnessProblems } from "../_helpers/freshness";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const past = new Date(Date.now() - 60_000);
const now = new Date();

/** Throwaway dir with a source in the past and an artifact at now — the
 * fresh baseline. */
function scratch(): { dir: string; source: string; artifact: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "freshness-"));
	dirs.push(dir);
	const source = path.join(dir, "source.ts");
	const artifact = path.join(dir, "artifact.js");
	fs.writeFileSync(source, "");
	fs.utimesSync(source, past, past);
	fs.writeFileSync(artifact, "");
	return { dir, source, artifact };
}

test("an artifact newer than its sources is fresh", () => {
	const { source, artifact } = scratch();

	expect(
		freshnessProblems([{ label: "thing", artifact, sources: [source] }]),
	).toEqual([]);
});

test("a source newer than the artifact is reported", () => {
	const { source, artifact } = scratch();
	// Force distinct mtimes so same-millisecond writes can't mask staleness.
	fs.utimesSync(artifact, past, past);
	fs.utimesSync(source, now, now);

	expect(
		freshnessProblems([{ label: "thing", artifact, sources: [source] }]),
	).toEqual(["thing is older than its sources"]);
});

test("a source dir is walked recursively, skipping build outputs", () => {
	const { dir, artifact } = scratch();
	fs.mkdirSync(path.join(dir, "public"));
	fs.writeFileSync(path.join(dir, "public/generated.js"), "");

	expect(
		freshnessProblems([{ label: "thing", artifact, sources: [dir] }]),
	).toEqual([]);

	// A real source touched after the artifact is staleness, even with the
	// artifact's mtime dragged backwards for determinism.
	fs.mkdirSync(path.join(dir, "deep"), { recursive: true });
	fs.writeFileSync(path.join(dir, "deep", "source.ts"), "");
	fs.utimesSync(artifact, past, past);
	expect(
		freshnessProblems([{ label: "thing", artifact, sources: [dir] }]),
	).toEqual(["thing is older than its sources"]);
});

test("a copied artifact must be byte-identical to its original", () => {
	const { dir, source } = scratch();
	const original = path.join(dir, "original.gz");
	const copy = path.join(dir, "copy.gz");
	fs.writeFileSync(original, "v1");
	fs.writeFileSync(copy, "v1");

	expect(
		freshnessProblems([
			{
				label: "copy",
				artifact: copy,
				sources: [source],
				copiedFrom: original,
			},
		]),
	).toEqual([]);

	fs.writeFileSync(copy, "v2");
	expect(
		freshnessProblems([
			{
				label: "copy",
				artifact: copy,
				sources: [source],
				copiedFrom: original,
			},
		]),
	).toEqual(["copy doesn't match the artifact it was copied from"]);
});

test("a missing artifact or original is reported", () => {
	const { dir, source } = scratch();
	expect(
		freshnessProblems([
			{
				label: "thing",
				artifact: path.join(dir, "nope.js"),
				sources: [source],
			},
		]),
	).toEqual(["thing isn't built"]);

	fs.writeFileSync(path.join(dir, "copy.gz"), "");
	expect(
		freshnessProblems([
			{
				label: "copy",
				artifact: path.join(dir, "copy.gz"),
				sources: [source],
				copiedFrom: path.join(dir, "nope.gz"),
			},
		]),
	).toEqual(["copy's original (nope.gz) isn't built"]);
});
