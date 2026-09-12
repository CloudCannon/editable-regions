import fs from "node:fs";
import path from "node:path";

/**
 * Freshness checks for locally built, untracked test artifacts (the Hugo
 * fixture bundles and the renderer wasm). A source change without the
 * matching rebuild makes suites pass or fail against out-of-date artifacts —
 * which has silently bitten before — so the harness refuses to boot anything
 * older than its sources.
 */

/** Directory and file names that are build outputs, not sources. */
const DEFAULT_IGNORE = new Set([
	"node_modules",
	"public",
	"resources",
	// Hugo's build lock, touched on every build.
	".hugo_build.lock",
]);

/** One built artifact and the inputs it must be newer than. */
export interface FreshnessCheck {
	/** Human-readable artifact name, used verbatim in problem messages. */
	label: string;
	/** The built file that tests would load. */
	artifact: string;
	/** Files/dirs (walked recursively) the artifact is built from. */
	sources?: string[];
	/** When set, the artifact must be byte-identical to this original. */
	copiedFrom?: string;
	/** Extra dir/file names skipped while walking `sources`. */
	ignore?: string[];
}

/** Newest file mtime under any of the given paths (dirs walked recursively). */
export function newestMtime(
	paths: string[],
	ignore: ReadonlySet<string> = DEFAULT_IGNORE,
): number {
	let newest = 0;
	for (const target of paths) {
		if (!fs.existsSync(target)) continue;
		const stats = fs.statSync(target);
		if (!stats.isDirectory()) {
			newest = Math.max(newest, stats.mtimeMs);
			continue;
		}
		const visit = (dir: string): void => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (ignore.has(entry.name)) continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					visit(full);
				} else if (entry.isFile()) {
					newest = Math.max(newest, fs.statSync(full).mtimeMs);
				}
			}
		};
		visit(target);
	}
	return newest;
}

/**
 * Collects every reason the given artifacts can't be trusted fresh, ready to
 * join into an error message. An empty list means go.
 */
export function freshnessProblems(checks: FreshnessCheck[]): string[] {
	const problems: string[] = [];
	for (const check of checks) {
		if (!fs.existsSync(check.artifact)) {
			problems.push(`${check.label} isn't built`);
			continue;
		}

		if (check.copiedFrom) {
			if (!fs.existsSync(check.copiedFrom)) {
				problems.push(
					`${check.label}'s original (${path.basename(check.copiedFrom)}) isn't built`,
				);
				continue;
			}
			if (
				!fs
					.readFileSync(check.artifact)
					.equals(fs.readFileSync(check.copiedFrom))
			) {
				problems.push(
					`${check.label} doesn't match the artifact it was copied from`,
				);
				continue;
			}
		}

		const ignore = check.ignore
			? new Set([...DEFAULT_IGNORE, ...check.ignore])
			: DEFAULT_IGNORE;
		if (
			check.sources?.length &&
			newestMtime(check.sources, ignore) > fs.statSync(check.artifact).mtimeMs
		) {
			problems.push(`${check.label} is older than its sources`);
		}
	}
	return problems;
}
