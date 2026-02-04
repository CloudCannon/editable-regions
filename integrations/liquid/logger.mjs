/**
 * Simple logger for live editing integration.
 * Enable verbose mode to see detailed logs in browser console.
 */

let verboseEnabled = false;

/**
 * Enables or disables verbose logging.
 *
 * @param {boolean} enabled - Whether to enable verbose logging
 * @returns {void}
 */
export function setVerbose(enabled) {
  verboseEnabled = enabled;
  if (enabled) {
    console.log("Live editing verbose logging enabled");
  }
}

/**
 * Returns whether verbose logging is enabled.
 *
 * @returns {boolean}
 */
export function isVerbose() {
  return verboseEnabled;
}

/**
 * Log only when verbose mode is enabled.
 * Use for diagnostic information during development.
 *
 * @param {...any} args - Arguments to log
 * @returns {void}
 */
export function log(...args) {
  if (verboseEnabled) {
    console.log(...args);
  }
}

/**
 * Always log warnings.
 *
 * @param {...any} args - Arguments to log
 * @returns {void}
 */
export function warn(...args) {
  console.warn(...args);
}

/**
 * Always log errors.
 *
 * @param {...any} args - Arguments to log
 * @returns {void}
 */
export function error(...args) {
  console.error(...args);
}

/**
 * Group logs (only in verbose mode).
 *
 * @param {string} label - Group label
 * @returns {void}
 */
export function group(label) {
  if (verboseEnabled) {
    console.group(label);
  }
}

/**
 * End a console group (only in verbose mode).
 *
 * @returns {void}
 */
export function groupEnd() {
  if (verboseEnabled) {
    console.groupEnd();
  }
}

/**
 * Start timing an operation (only in verbose mode).
 *
 * @param {string} label - Timer label
 * @returns {void}
 */
export function time(label) {
  if (verboseEnabled) {
    console.time(label);
  }
}

/**
 * End timing an operation (only in verbose mode).
 *
 * @param {string} label - Timer label
 * @returns {void}
 */
export function timeEnd(label) {
  if (verboseEnabled) {
    console.timeEnd(label);
  }
}

