import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { CommandBase } from './command.base.mjs';
import { expandPatterns } from '../utils/paths.util.mjs';
import { red } from '../utils/colors.util.mjs';
import { FileResult, STATUS } from '../models/file-result.model.mjs';
import { CheckResult } from '../models/check-result.model.mjs';

/**
 * Check command. Compares protected files against the stored hash
 * store and reports integrity per file. Also supports checking all
 * configured projects in a single run.
 */
export class CheckCommand extends CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads project configs
   * @param {HashStore} hashStore - computes and loads file hashes
   * @param {FileLock} fileLock - checks read-only flags
   * @param {Report} report - all console and file output
   */
  constructor(configLoader, hashStore, fileLock, report) {
    super(configLoader, hashStore, fileLock, report);
  }

  /**
   * Check the files protected by the named project config.
   * @param {string} name - config filename without extension
   * @returns {Promise<CheckResult>} the computed check result
   */
  async execute(name) {
    const config = this._configLoader.load(name);
    const store = this._hashStore.load(name);
    if (store === null) {
      throw new Error(`No hash store found. Run: node guard.mjs capture ${name}`);
    }
    const { paths, warnings } = expandPatterns(config.root, config.protected);
    this._printWarnings(warnings);
    const files = this._buildFileResults(config, store, paths);
    const checkResult = new CheckResult(config.name, name, new Date(), files, config.root);
    this._report.printCheckResult(checkResult);
    if (checkResult.violations > 0) {
      this._report.printAgentBlock(checkResult);
    }
    this._report.writeReportFile(checkResult);
    process.exitCode = checkResult.violations > 0 ? 1 : 0;
    return checkResult;
  }

  /**
   * Check every configured project and print a combined summary.
   * A per-project failure is recorded and reported in red without
   * stopping the remaining checks.
   */
  async executeAll() {
    const names = this._configLoader.listAll();
    if (names.length === 0) {
      throw new Error('No configs found in configs/. Run init first.');
    }
    const results = [];
    for (const name of names) {
      try {
        results.push(await this.execute(name));
      } catch (error) {
        const projectName = this._projectNameOf(name);
        results.push({ configName: name, projectName, error: error.message });
        process.stderr.write(red(`${projectName}: ERROR: ${error.message}\n`));
      }
    }
    this._report.printCombinedSummary(results);
    process.exitCode = results.some((result) => this._isFailure(result)) ? 1 : 0;
  }

  /**
   * Build a FileResult for every expanded path using the hash store.
   * @param {ProjectConfig} config - loaded project config
   * @param {object} store - loaded hash store object
   * @param {string[]} paths - absolute file paths from expandPatterns
   * @returns {FileResult[]}
   */
  _buildFileResults(config, store, paths) {
    const files = store.files || {};
    return paths.map((absPath) => {
      const relativePath = this._toForwardSlashes(relative(config.root, absPath));
      const stored = files[relativePath];
      if (!stored) {
        return new FileResult(relativePath, STATUS.NOT_CAPTURED, null, null, null);
      }
      if (!existsSync(absPath)) {
        return new FileResult(
          relativePath,
          STATUS.MISSING,
          this._shortHash(stored.sha256),
          null,
          null
        );
      }
      return this._classifyFile(relativePath, absPath, stored);
    });
  }

  /**
   * Classify a file that exists on disk and has a stored hash.
   * @param {string} relativePath - forward-slash relative path
   * @param {string} absPath - absolute file path
   * @param {object} stored - { sha256 } entry from the hash store
   * @returns {FileResult}
   */
  _classifyFile(relativePath, absPath, stored) {
    const actual = this._hashStore.compute(absPath);
    const expected = this._shortHash(stored.sha256);
    if (actual !== stored.sha256) {
      return new FileResult(
        relativePath,
        STATUS.MODIFIED,
        expected,
        this._shortHash(actual),
        this._mtime(absPath)
      );
    }
    if (!this._fileLock.isLocked(absPath)) {
      return new FileResult(
        relativePath,
        STATUS.NOT_LOCKED,
        expected,
        this._shortHash(actual),
        null
      );
    }
    return new FileResult(relativePath, STATUS.INTACT, expected, this._shortHash(actual), null);
  }

  /**
   * First 12 characters of a hash, or null when not a string.
   * @param {string|null} hex - full sha256 hex
   * @returns {string|null} shortened hash
   */
  _shortHash(hex) {
    return typeof hex === 'string' ? hex.slice(0, 12) : null;
  }

  /**
   * File modification time, or null when stat fails.
   * @param {string} absPath - absolute file path
   * @returns {Date|null} modification time
   */
  _mtime(absPath) {
    try {
      return statSync(absPath).mtime;
    } catch {
      return null;
    }
  }

  /**
   * Best-effort project name for an error entry.
   * @param {string} name - config name
   * @returns {string} project name or the config name as fallback
   */
  _projectNameOf(name) {
    try {
      return this._configLoader.load(name).name;
    } catch {
      return name;
    }
  }

  /**
   * Whether a combined-summary result counts as a failure.
   * @param {object} result - CheckResult or { configName, projectName, error }
   * @returns {boolean} true when the project has violations or an error
   */
  _isFailure(result) {
    if (result instanceof CheckResult) {
      return result.violations > 0;
    }
    return Boolean(result.error);
  }

  /**
   * Print expandPatterns warnings via the report service.
   * @param {string[]} warnings - collected pattern warnings
   */
  _printWarnings(warnings) {
    for (const warning of warnings) {
      this._report.printWarning(warning);
    }
  }

  /**
   * Convert a path to forward slashes.
   * @param {string} p - path to convert
   * @returns {string} normalized path
   */
  _toForwardSlashes(p) {
    return p.replace(/\\/g, '/');
  }
}
