/**
 * Simple logger for live editing integration.
 * Enable verbose mode to see detailed logs in browser console.
 */

let verboseEnabled = false;

/** @param {boolean} enabled */
export function setVerbose(enabled) {
	verboseEnabled = enabled;
	if (enabled) {
		console.log("Live editing verbose logging enabled");
	}
}

/** Log only when verbose mode is enabled. */
export function log(/** @type {any[]} */ ...args) {
	if (verboseEnabled) {
		console.log(...args);
	}
}

export function warn(/** @type {any[]} */ ...args) {
	console.warn(...args);
}

const warnedKeys = new Set();

/** Warn exactly once per key for the lifetime of the page. */
export function warnOnce(
	/** @type {string} */ key,
	/** @type {any[]} */ ...args
) {
	if (warnedKeys.has(key)) return;
	warnedKeys.add(key);
	warn(...args);
}

/** Group logs (only in verbose mode). */
export function group(/** @type {string} */ label) {
	if (verboseEnabled) {
		console.group(label);
	}
}

export function groupEnd() {
	if (verboseEnabled) {
		console.groupEnd();
	}
}
