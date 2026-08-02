/**
 * Immutable result for a single protected file.
 * Status values are the named constants below; never string literals elsewhere.
 */

/** Named status constants used across the whole tool. */
export const STATUS = {
  INTACT: 'INTACT',
  MODIFIED: 'MODIFIED',
  MISSING: 'MISSING',
  NOT_CAPTURED: 'NOT_CAPTURED',
  NOT_LOCKED: 'NOT_LOCKED',
};

/**
 * Immutable per-file check result.
 */
export class FileResult {
  /**
   * @param {string} relativePath - path relative to config.root, forward slashes
   * @param {string} status - one of the STATUS constants
   * @param {string|null} expectedHash - expected hash (first 12 chars) or null
   * @param {string|null} actualHash - actual hash (first 12 chars) or null
   * @param {Date|null} modifiedAt - file modification time or null
   */
  constructor(relativePath, status, expectedHash, actualHash, modifiedAt) {
    this.relativePath = relativePath;
    this.status = status;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
    this.modifiedAt = modifiedAt;
    Object.freeze(this);
  }
}
