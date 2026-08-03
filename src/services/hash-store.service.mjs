import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Computes SHA-256 hashes and persists/loads hash stores.
 * Permission handling for the hash store file itself (unlock/write/relock)
 * is entirely internal to save(). It never prints and never expands patterns.
 */
export class HashStore {
  /**
   * @param {string} hashesDir - absolute path to the tool's hashes/ directory
   * @param {FileLock} fileLock - sets and removes read-only flags
   */
  constructor(hashesDir, fileLock) {
    this._hashesDir = hashesDir;
    this._fileLock = fileLock;
  }

  /**
   * Compute the SHA-256 hex digest of a file. Reads raw bytes (Buffer),
   * never UTF-8, so any binary file hashes correctly.
   * @param {string} filePath - absolute file path
   * @returns {string} lowercase sha256 hex digest
   */
  compute(filePath) {
    let buffer;
    try {
      buffer = readFileSync(filePath);
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        throw new Error(`Cannot read ${filePath}: locked by another process.`);
      }
      throw error;
    }
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Persist a hash store for a named project. If the store file already
   * exists and is read-only, it is unlocked before writing and relocked
   * afterwards. All permission handling happens here.
   * @param {string} name - config filename without extension
   * @param {Array<{ relativePath: string, sha256: string, captured: boolean }>} fileEntries
   */
  save(name, fileEntries) {
    const storePath = this._pathFor(name);
    if (existsSync(storePath) && this._fileLock.isLocked(storePath)) {
      this._fileLock.unlock(storePath);
    }
    const captured = new Date().toISOString();
    const files = {};
    for (const entry of fileEntries) {
      files[entry.relativePath] = {
        sha256: entry.sha256,
        captured: typeof entry.captured === 'string' ? entry.captured : captured,
      };
    }
    const data = { version: 1, project: name, captured, files };
    writeFileSync(storePath, JSON.stringify(data, null, 2));
    this._fileLock.lock(storePath);
  }

  /**
   * Load a hash store for a named project.
   * @param {string} name - config filename without extension
   * @returns {object|null} parsed hash store, or null when no store exists
   */
  load(name) {
    const storePath = this._pathFor(name);
    if (!existsSync(storePath)) {
      return null;
    }
    let raw;
    try {
      raw = readFileSync(storePath, 'utf8');
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        throw new Error(`Cannot read ${storePath}: locked by another process.`);
      }
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Hash store corrupted: hashes/${name}.hashes.json`);
    }
    const version =
      parsed && Number.isInteger(parsed.version) ? parsed.version : 1;
    if (version !== 1) {
      throw new Error(`Unsupported hash store version: ${version}`);
    }
    return parsed;
  }

  /**
   * Absolute path to a named hash store file.
   * @param {string} name - config filename without extension
   * @returns {string} absolute hash store path
   */
  _pathFor(name) {
    return join(this._hashesDir, `${name}.hashes.json`);
  }
}
