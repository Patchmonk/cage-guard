import { existsSync } from 'node:fs';
import { relative } from 'node:path';

import { CommandBase } from './command.base.mjs';
import { expandPatterns } from '../utils/paths.util.mjs';

/**
 * Capture command. Hashes every protected file, sets each file
 * read-only, persists a hash store, and locks the config file.
 */
export class CaptureCommand extends CommandBase {
  /**
   * Execute the capture for a named project.
   * @param {string[]} args - positional args; exactly one project name
   */
  async execute(args) {
    if (args.length !== 1) {
      throw new Error('Project name required. Usage: node guard.mjs capture <name>');
    }
    const name = args[0];
    const config = this._configLoader.load(name);
    const { paths, warnings } = expandPatterns(config.root, config.protected);
    const patternWarningCount = this._printWarnings(warnings);
    if (paths.length === 0) {
      this._output.renderEmptyCapture(config, patternWarningCount);
      process.exitCode = 0;
      return;
    }
    const { entries, warningCount } = this._captureFiles(config, paths);
    this._hashStore.save(name, entries);
    this._lockConfig(config);
    this._output.renderCaptureResult(config, entries, patternWarningCount + warningCount);
  }

  /**
   * Hash and lock each matched file, returning the entry list and the
   * number of warnings emitted. Missing files are skipped with a warning;
   * lock failures are warned but never crash the capture.
   * @param {ProjectConfig} config - loaded project config
   * @param {string[]} paths - absolute file paths from expandPatterns
   * @returns {{ entries: Array<{ relativePath: string, sha256: string, captured: boolean }>, warningCount: number }}
   */
  _captureFiles(config, paths) {
    const entries = [];
    let warningCount = 0;
    for (const absPath of paths) {
      const relativePath = this._toForwardSlashes(relative(config.root, absPath));
      if (!existsSync(absPath)) {
        this._output.renderWarning(`File not found: ${relativePath}. Skipped.`);
        warningCount += 1;
        continue;
      }
      const sha256 = this._hashStore.compute(absPath);
      if (!this._fileLock.lock(absPath)) {
        this._output.renderWarning(`Could not lock file: ${relativePath}`);
        warningCount += 1;
      }
      entries.push({ relativePath, sha256, captured: true });
    }
    return { entries, warningCount };
  }

  /**
   * Set the config file read-only; warn (but do not crash) on failure.
   * @param {ProjectConfig} config - loaded project config
   */
  _lockConfig(config) {
    if (!this._fileLock.lock(config.configPath)) {
      this._output.renderWarning(`Could not lock config: ${config.configPath}`);
    }
  }

  /**
   * Print expandPatterns warnings via the output service.
   * @param {string[]} warnings - collected pattern warnings
   * @returns {number} number of warnings printed
   */
  _printWarnings(warnings) {
    for (const warning of warnings) {
      this._output.renderWarning(warning);
    }
    return warnings.length;
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