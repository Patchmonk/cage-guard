/**
 * ANSI color and glyph helpers for console output.
 * Pure functions; they only wrap text in escape codes. Never print.
 */

/** Check mark glyph used for positive results. */
export const CHECK = '✓';
/** Cross mark glyph used for violations. */
export const CROSS = '✗';
/** Warning glyph used for warnings. */
export const WARN = '!';

/**
 * Wrap text in ANSI green.
 * @param {string} text - text to colorize
 * @returns {string} green text followed by the reset code
 */
export function green(text) {
  return `\x1b[32m${text}\x1b[0m`;
}

/**
 * Wrap text in ANSI red.
 * @param {string} text - text to colorize
 * @returns {string} red text followed by the reset code
 */
export function red(text) {
  return `\x1b[31m${text}\x1b[0m`;
}

/**
 * Wrap text in ANSI yellow.
 * @param {string} text - text to colorize
 * @returns {string} yellow text followed by the reset code
 */
export function yellow(text) {
  return `\x1b[33m${text}\x1b[0m`;
}

/**
 * Wrap text in ANSI bold.
 * @param {string} text - text to embolden
 * @returns {string} bold text followed by the reset code
 */
export function bold(text) {
  return `\x1b[1m${text}\x1b[0m`;
}

/**
 * Wrap text in ANSI dim.
 * @param {string} text - text to dim
 * @returns {string} dim text followed by the reset code
 */
export function dim(text) {
  return `\x1b[2m${text}\x1b[0m`;
}
