import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { CommandBase } from './command.base.mjs';
import { expandPatterns } from '../utils/paths.util.mjs';
import { FileResult, STATUS } from '../models/file-result.model.mjs';
import { CheckResult } from '../models/check-result.model.mjs';
import { CheckError } from '../models/check-error.model.mjs';

/**
 * Check command. Compares protected files against the stored hash
 * store and reports integrity per file. Also supports checking all
 * configured projects in a single run. Arity dispatch (0 vs 1 arg)
 * selects single vs combined mode — data-driven, not type dispatch.
 */
export class CheckCommand extends CommandBase {
  /**
   * Execute a check. No args checks every project; one arg checks one.
   * @param {string[]} args - positional args; zero or one project name
   * @returns {Promise<CheckResult|null>} result, or null for the all-path
   */
  async execute(args) {
    if (args.length === 0) {
      return this._executeAll();
    }
    if (args.length !== 1) {
      throw new Error('Usage: node guard.mjs check [<name>]');
    }
    return this._executeOne(args[0]);
  }

  /**
   * Check the files protected by the named project config.
   * @param {string} name - config filename without extension
   * @returns {Promise<CheckResult>} the computed check result
   */
  async _executeOne(name) {
    const checkResult = await this._computeOne(name);
    this._output.renderCheckResult(checkResult);
    if (checkResult.violations > 0) {
      this._output.renderAgentBlock(checkResult);
    }
    this._output.writeReportFile(checkResult);
    process.exitCode = checkResult.violations > 0 ? 1 : 0;
    return checkResult;
  }

  /**
   * Compute a single-project check result without rendering it.
   * Emits pattern warnings only; rendering is the caller's job.
   * @param {string} name - config filename without extension
   * @returns {Promise<CheckResult>} the computed check result
   */
  async _computeOne(name) {
    const config = this._configLoader.load(name);
    const store = this._hashStore.load(name);
    if (store === null) {
      throw new Error(`No hash store found. Run: node guard.mjs capture ${name}`);
    }
    const { paths, warnings } = expandPatterns(config.root, config.protected);
    this._printWarnings(warnings);
    const files = this._buildFileResults(config, store, paths);
    return new CheckResult(config.name, name, new Date(), files, config.root);
  }

  /**
   * Check every configured project and print a combined summary.
   * A per-project failure is recorded as a CheckError and reported in
   * red without stopping the remaining checks. In text mode each project
   * is also rendered individually; in single-document (JSON) mode only
   * the combined document is emitted so stdout stays one document.
   */
  async _executeAll() {
    const names = this._configLoader.listAll();
    if (names.length === 0) {
      throw new Error('No configs found in configs/. Run init first.');
    }
    const results = [];
    for (const name of names) {
      try {
        const checkResult = await this._computeOne(name);
        results.push(checkResult);
        if (!this._output.isSingleDocument()) {
          this._output.renderCheckResult(checkResult);
          if (checkResult.violations > 0) {
            this._output.renderAgentBlock(checkResult);
          }
          this._output.writeReportFile(checkResult);
        }
      } catch (error) {
        const projectName = this._projectNameOf(name);
        results.push(new CheckError(projectName, name, error.message));
        this._output.renderError(`${projectName}: ERROR: ${error.message}`);
      }
    }
    this._output.renderCombinedSummary(results);
    process.exitCode = results.some((result) => !result.passed) ? 1 : 0;
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
   * Print expandPatterns warnings via the output service.
   * @param {string[]} warnings - collected pattern warnings
   */
  _printWarnings(warnings) {
    for (const warning of warnings) {
      this._output.renderWarning(warning);
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