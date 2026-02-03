/**
 * Simple logger for live editing integration.
 * Enable verbose mode to see detailed logs in browser console.
 */

let verboseEnabled = false;

export function setVerbose(enabled) {
  verboseEnabled = enabled;
  if (enabled) {
    console.log('Live editing verbose logging enabled');
  }
}

export function isVerbose() {
  return verboseEnabled;
}

/**
 * Log only when verbose mode is enabled.
 * Use for diagnostic information during development.
 */
export function log(...args) {
  if (verboseEnabled) {
    console.log(...args);
  }
}

/**
 * Always log warnings.
 */
export function warn(...args) {
  console.warn(...args);
}

/**
 * Always log errors.
 */
export function error(...args) {
  console.error(...args);
}

/**
 * Group logs (only in verbose mode).
 */
export function group(label) {
  if (verboseEnabled) {
    console.group(label);
  }
}

export function groupEnd() {
  if (verboseEnabled) {
    console.groupEnd();
  }
}

/**
 * Time operations (only in verbose mode).
 */
export function time(label) {
  if (verboseEnabled) {
    console.time(label);
  }
}

export function timeEnd(label) {
  if (verboseEnabled) {
    console.timeEnd(label);
  }
}
