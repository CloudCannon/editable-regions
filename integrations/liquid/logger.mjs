// Logging is gated on verbose mode, except `warn`/`warnOnce`.

let verboseEnabled = false;

/** @param {boolean} enabled */
export function setVerbose(enabled) {
	verboseEnabled = enabled;
	if (enabled) {
		console.log("Live editing verbose logging enabled");
	}
}

export function log(/** @type {any[]} */ ...args) {
	if (verboseEnabled) {
		console.log(...args);
	}
}

export function warn(/** @type {any[]} */ ...args) {
	console.warn(...args);
}

const warnedKeys = new Set();

/** Warns once per key for the lifetime of the page. */
export function warnOnce(
	/** @type {string} */ key,
	/** @type {any[]} */ ...args
) {
	if (warnedKeys.has(key)) return;
	warnedKeys.add(key);
	warn(...args);
}

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
