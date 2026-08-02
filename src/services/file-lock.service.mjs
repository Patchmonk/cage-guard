import { accessSync, chmodSync, constants, existsSync } from 'node:fs';

/**
 * Sets, removes, and checks the read-only flag on files.
 * Uses fs.chmodSync only — never shells out to attrib or icacls.
 * Never throws: lock/unlock return false on failure.
 */
export class FileLock {
  /**
   * Set a file read-only.
   * @param {string} filePath - absolute file path
   * @returns {boolean} true when the lock succeeded
   */
  lock(filePath) {
    try {
      chmodSync(filePath, 0o444);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove the read-only flag from a file.
   * @param {string} filePath - absolute file path
   * @returns {boolean} true when the unlock succeeded
   */
  unlock(filePath) {
    try {
      chmodSync(filePath, 0o666);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check whether a file is read-only (locked).
   * @param {string} filePath - absolute file path
   * @returns {boolean} true when the file is locked, false when writable or missing
   */
  isLocked(filePath) {
    if (!existsSync(filePath)) {
      return false;
    }
    try {
      accessSync(filePath, constants.W_OK);
      return false;
    } catch {
      return true;
    }
  }
}
