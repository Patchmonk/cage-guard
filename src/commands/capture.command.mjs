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
   * @param {ConfigLoader} configLoader - loads project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets and checks read-only flags
   * @param {Report} report - all console output
   */
  constructor(configLoader, hashStore, fileLock, report) {
    super(configLoader, hashStore, fileLock, report);
  }

  /**
   * Capture the files protected by the named project config.
   * @param {string} name - config filename without extension
   */
  async execute(name) {
    const config = this._configLoader.load(name);
    const { paths, warnings } = expandPatterns(config.root, config.protected);
    this._printWarnings(warnings);
    if (paths.length === 0) {
      process.stdout.write('No files matched any pattern in config. Nothing to capture.\n');
      process.exitCode = 0;
      return;
    }
    const fileEntries = this._captureFiles(config, paths);
    this._hashStore.save(name, fileEntries);
    this._lockConfig(config);
    this._report.printCaptureSummary(config, fileEntries);
  }

  /**
   * Hash and lock each matched file, returning the entry list.
   * Missing files are skipped with a warning; lock failures are warned
   * but never crash the capture.
   * @param {ProjectConfig} config - loaded project config
   * @param {string[]} paths - absolute file paths from expandPatterns
   * @returns {Array<{ relativePath: string, sha256: string, captured: boolean }>}
   */
  _captureFiles(config, paths) {
    const entries = [];
    for (const absPath of paths) {
      const relativePath = this._toForwardSlashes(relative(config.root, absPath));
      if (!existsSync(absPath)) {
        this._report.printWarning(`File not found: ${relativePath}. Skipped.`);
        continue;
      }
      const sha256 = this._hashStore.compute(absPath);
      if (!this._fileLock.lock(absPath)) {
        this._report.printWarning(`Could not lock file: ${relativePath}`);
      }
      entries.push({ relativePath, sha256, captured: true });
    }
    return entries;
  }

  /**
   * Set the config file read-only; warn (but do not crash) on failure.
   * @param {ProjectConfig} config - loaded project config
   */
  _lockConfig(config) {
    if (!this._fileLock.lock(config.configPath)) {
      this._report.printWarning(`Could not lock config: ${config.configPath}`);
    }
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
