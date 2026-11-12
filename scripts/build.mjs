import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const copies = [
	{ dir: "styles", match: (rel) => rel.endsWith(".css") },
	{ dir: "integrations/astro/modules", match: (rel) => rel.endsWith(".astro") },
	{ dir: "integrations/svelte", match: (rel) => rel.endsWith(".svelte") },
	// Hugo is intentionally absent: a Git-based module, never part of the npm package.
];

async function* walk(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.isFile()) yield full;
	}
}

async function copyAssets() {
	for (const { dir, match } of copies) {
		const base = path.join(root, dir);
		for await (const file of walk(base)) {
			const rel = path.relative(base, file).split(path.sep).join("/");
			if (!match(rel)) continue;
			const target = path.join(dist, dir, rel);
			await mkdir(path.dirname(target), { recursive: true });
			await cp(file, target);
		}
	}
}

function runTsc() {
	// Running tsc via node avoids platform-specific .cmd/.sh shim handling.
	const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
	const { status } = spawnSync(
		process.execPath,
		[tsc, "-p", "tsconfig.json"],
		{
			cwd: root,
			stdio: "inherit",
		},
	);
	if (status !== 0) {
		console.error(
			`tsc exited with status ${status ?? "unknown"}; build failed.`,
		);
		process.exit(status ?? 1);
	}
}

await rm(dist, { recursive: true, force: true });
runTsc();
await copyAssets();
