// Module-local logger; logging is gated on verbose mode, except
// `warn`/`warnOnce`.

let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
	verboseEnabled = enabled;
	if (enabled) {
		console.log("Live editing verbose logging enabled");
	}
}

export function log(...args: any[]): void {
	if (verboseEnabled) {
		console.log(...args);
	}
}

export function warn(...args: any[]): void {
	console.warn(...args);
}

const warnedKeys = new Set<string>();

/** Warns once per key for the lifetime of the page. */
export function warnOnce(key: string, ...args: any[]): void {
	if (warnedKeys.has(key)) return;
	warnedKeys.add(key);
	warn(...args);
}

export function group(label: string): void {
	if (verboseEnabled) {
		console.group(label);
	}
}

export function groupEnd(): void {
	if (verboseEnabled) {
		console.groupEnd();
	}
}
