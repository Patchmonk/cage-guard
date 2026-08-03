import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { ProjectConfig } from '../models/project-config.model.mjs';
import { isAbsolutePath } from '../utils/paths.util.mjs';

/** Current config schema version. */
const CONFIG_VERSION = 1;

/**
 * Loads, validates, lists, and writes project config files.
 * It does not hash, lock, report, or scan. Single responsibility:
 * everything about config file persistence.
 */
export class ConfigLoader {
  /**
   * @param {string} configsDir - absolute path to the tool's configs/ directory
   * @param {FileLock} fileLock - sets and removes read-only flags
   */
  constructor(configsDir, fileLock) {
    this._configsDir = configsDir;
    this._fileLock = fileLock;
  }

  /**
   * Read and validate the config for a named project.
   * @param {string} name - config filename without extension
   * @returns {ProjectConfig} validated, immutable project config
   */
  load(name) {
    const configPath = this._pathFor(name);
    let raw;
    try {
      raw = readFileSync(configPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config not found: configs/${name}.json`);
      }
      throw error;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in configs/${name}.json: ${error.message}`);
    }
    const { version } = this._migrate(data);
    const validated = this.validate(data);
    return new ProjectConfig(
      validated.name,
      validated.root,
      validated.protected,
      configPath,
      version
    );
  }

  /**
   * List all config names in configs/ (filenames without .json).
   * @returns {string[]} config names, sorted
   */
  listAll() {
    const names = [];
    const entries = readdirSync(this._configsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        entry.name !== '.gitkeep'
      ) {
        names.push(entry.name.slice(0, -5));
      }
    }
    return names.sort();
  }

  /**
   * Validate raw config data with specific error messages and return
   * the cleaned fields (protected filtered for empty strings and duplicates).
   * @param {object} data - parsed config JSON
   * @returns {{ name: string, root: string, protected: string[] }}
   */
  validate(data) {
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new Error("Config 'name' must be a non-empty string.");
    }
    if (!data || typeof data.root !== 'string' || data.root.trim() === '') {
      throw new Error("Config 'root' must be a non-empty string.");
    }
    if (!isAbsolutePath(data.root)) {
      throw new Error(`Config 'root' must be an absolute path. Got: ${data.root}`);
    }
    if (!existsSync(data.root)) {
      throw new Error(`Project root not found: ${data.root}`);
    }
    if (
      !Array.isArray(data.protected) ||
      data.protected.length === 0 ||
      !data.protected.every((item) => typeof item === 'string')
    ) {
      throw new Error("Config 'protected' must be a non-empty array of strings.");
    }
    return {
      name: data.name,
      root: data.root,
      protected: this._cleanProtected(data.protected),
    };
  }

  /**
   * Resolve the schema version of raw config data. Old configs without a
   * version field default to v1. Migration is in-memory only — the next
   * write persists the version. A future v2 slots in here.
   * @param {object} data - parsed config JSON
   * @returns {{ version: number }} resolved version
   */
  _migrate(data) {
    const version =
      data && Number.isInteger(data.version) ? data.version : CONFIG_VERSION;
    if (version !== CONFIG_VERSION) {
      throw new Error(`Unsupported config version: ${version}`);
    }
    return { version };
  }

  /**
   * Filter empty strings and duplicates out of a protected pattern list.
   * @param {string[]} patterns - raw protected patterns
   * @returns {string[]} cleaned, deduplicated patterns
   */
  _cleanProtected(patterns) {
    const seen = new Set();
    const protectedList = [];
    for (const item of patterns) {
      const trimmed = item.trim();
      if (trimmed === '' || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      protectedList.push(trimmed);
    }
    return protectedList;
  }

  /**
   * Write a config file atomically (temp file + rename) with 2-space JSON
   * indentation and the current schema version. If the target is read-only
   * it is unlocked before writing and relocked afterwards.
   * @param {string} name - config filename without extension
   * @param {object} data - config data to persist
   */
  write(name, data) {
    const configPath = this._pathFor(name);
    const payload = { version: CONFIG_VERSION, ...data };
    const tmpPath = `${configPath}.tmp`;
    const wasLocked = this._fileLock.isLocked(configPath);
    if (wasLocked) {
      this._fileLock.unlock(configPath);
    }
    try {
      writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
      renameSync(tmpPath, configPath);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Temp file already gone; nothing to clean up.
      }
      throw error;
    } finally {
      if (wasLocked) {
        this._fileLock.lock(configPath);
      }
    }
  }

  /**
   * Absolute path to a named config file.
   * @param {string} name - config filename without extension
   * @returns {string} absolute config path
   */
  _pathFor(name) {
    return join(this._configsDir, `${name}.json`);
  }
}